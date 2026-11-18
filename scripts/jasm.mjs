// A Jasmin-style assembler for class-file version 49, which needs no StackMapTable frames.
// Usage: node scripts/jasm.mjs input.j output.class
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ACCESS = { public: 0x0001, private: 0x0002, protected: 0x0004, static: 0x0008, final: 0x0010, super: 0x0020 };

// mnemonic: [opcode, operand kind]. Kinds: "" none, b int8, s int16, v local index,
// j branch label, f field ref, m method ref, a array type.
const OPCODES = {
  iconst_0: [0x03, ""], iconst_1: [0x04, ""], iconst_2: [0x05, ""], iconst_3: [0x06, ""],
  bipush: [0x10, "b"], sipush: [0x11, "s"],
  iload: [0x15, "v"], iload_0: [0x1a, ""], iload_1: [0x1b, ""], iload_2: [0x1c, ""], iload_3: [0x1d, ""],
  iaload: [0x2e, ""],
  istore: [0x36, "v"], istore_0: [0x3b, ""], istore_1: [0x3c, ""], istore_2: [0x3d, ""], istore_3: [0x3e, ""],
  iastore: [0x4f, ""],
  iadd: [0x60, ""], imul: [0x68, ""], idiv: [0x6c, ""], irem: [0x70, ""],
  ifeq: [0x99, "j"], if_icmpne: [0xa0, "j"], goto: [0xa7, "j"],
  ireturn: [0xac, ""], return: [0xb1, ""],
  getstatic: [0xb2, "f"], putstatic: [0xb3, "f"], invokestatic: [0xb8, "m"],
  newarray: [0xbc, "a"],
};
const OPERAND_BYTES = { "": 0, b: 1, s: 2, v: 1, j: 2, f: 2, m: 2, a: 1 };
const ATYPE = { int: 10 };

const u1 = (value) => Buffer.from([value & 0xff]);
const u2 = (value) => Buffer.from([(value >> 8) & 0xff, value & 0xff]);
const u4 = (value) => Buffer.from([(value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);

class ConstantPool {
  #entries = [];
  #slots = new Map();
  #count = 1;

  #add(key, bytes) {
    if (!this.#slots.has(key)) {
      this.#slots.set(key, this.#count);
      this.#entries.push(bytes);
      this.#count += 1;
    }
    return this.#slots.get(key);
  }
  utf8(text) {
    const data = Buffer.from(text, "utf8");
    return this.#add(`U:${text}`, Buffer.concat([u1(1), u2(data.length), data]));
  }
  classRef(name) {
    const nameIndex = this.utf8(name);
    return this.#add(`C:${name}`, Buffer.concat([u1(7), u2(nameIndex)]));
  }
  member(tag, owner, name, descriptor) {
    const classIndex = this.classRef(owner);
    const nameIndex = this.utf8(name);
    const typeIndex = this.utf8(descriptor);
    const pairIndex = this.#add(`NT:${name}${descriptor}`, Buffer.concat([u1(12), u2(nameIndex), u2(typeIndex)]));
    return this.#add(`M${tag}:${owner}.${name}${descriptor}`, Buffer.concat([u1(tag), u2(classIndex), u2(pairIndex)]));
  }
  get count() { return this.#count; }
  serialize() { return Buffer.concat(this.#entries); }
}

function accessOf(words) {
  return words.reduce((flags, word) => {
    if (!(word in ACCESS)) throw new Error(`unknown access word ${word}`);
    return flags | ACCESS[word];
  }, 0);
}

function parseInstruction(line) {
  const [mnemonic, ...operands] = line.split(/\s+/);
  if (!(mnemonic in OPCODES)) throw new Error(`unknown mnemonic ${mnemonic}`);
  return { mnemonic, operands, kind: OPCODES[mnemonic][1], opcode: OPCODES[mnemonic][0] };
}

function methodItems(lines) {
  const items = [];
  for (const line of lines) {
    if (line.endsWith(":")) items.push({ label: line.slice(0, -1) });
    else items.push(parseInstruction(line));
  }
  return items;
}

function encodeMethod(method, pool) {
  let pc = 0;
  const labels = new Map();
  for (const item of method.items) {
    if (item.label !== undefined) {
      labels.set(item.label, pc);
    } else {
      item.pc = pc;
      pc += 1 + OPERAND_BYTES[item.kind];
    }
  }
  const parts = [];
  for (const item of method.items) {
    if (item.label !== undefined) continue;
    parts.push(u1(item.opcode));
    const [first, second] = item.operands;
    switch (item.kind) {
      case "": break;
      case "b": parts.push(Buffer.from([Number(first) & 0xff])); break;
      case "s": parts.push(u2(Number(first))); break;
      case "v": parts.push(u1(Number(first))); break;
      case "a": parts.push(u1(ATYPE[first])); break;
      case "j": {
        if (!labels.has(first)) throw new Error(`undefined label ${first}`);
        const offset = labels.get(first) - item.pc;
        if (offset < -32768 || offset > 32767) throw new Error(`branch to ${first} out of range`);
        parts.push(u2(offset));
        break;
      }
      case "f": {
        const [owner, name] = first.split("/").length > 1 ? [first.slice(0, first.lastIndexOf("/")), first.slice(first.lastIndexOf("/") + 1)] : [first, first];
        parts.push(u2(pool.member(9, owner, name, second)));
        break;
      }
      case "m": {
        const paren = first.indexOf("(");
        const qualified = first.slice(0, paren);
        const owner = qualified.slice(0, qualified.lastIndexOf("/"));
        const name = qualified.slice(qualified.lastIndexOf("/") + 1);
        parts.push(u2(pool.member(10, owner, name, first.slice(paren))));
        break;
      }
      default: throw new Error(`unhandled operand kind ${item.kind}`);
    }
  }
  const code = Buffer.concat(parts);
  if (method.limits.stack === undefined || method.limits.locals === undefined) {
    throw new Error(`${method.name} is missing .limit stack or .limit locals`);
  }
  return { code, pc };
}

export function assemble(source) {
  const pool = new ConstantPool();
  let className = null;
  let superName = "java/lang/Object";
  let classFlags = ACCESS.super;
  const fields = [];
  const methods = [];
  let current = null;

  const lines = source.split("\n").map((raw) => raw.replace(/;.*$/, "").trim()).filter(Boolean);
  const pending = [];
  lines.forEach((line, index) => {
    try {
      if (line.startsWith(".class ")) {
        const words = line.split(/\s+/).slice(1);
        className = words.pop();
        classFlags |= accessOf(words);
      } else if (line.startsWith(".super ")) {
        superName = line.split(/\s+/)[1];
      } else if (line.startsWith(".field ")) {
        const words = line.split(/\s+/).slice(1);
        fields.push({ flags: accessOf(words.slice(0, -2)), name: words.at(-2), descriptor: words.at(-1) });
      } else if (line.startsWith(".method ")) {
        const words = line.split(/\s+/).slice(1);
        const signature = words.pop();
        const paren = signature.indexOf("(");
        current = { flags: accessOf(words), name: signature.slice(0, paren), descriptor: signature.slice(paren), limits: {}, lines: [] };
        methods.push(current);
      } else if (line === ".end method") {
        current = null;
      } else if (line.startsWith(".limit ")) {
        const [, kind, value] = line.split(/\s+/);
        current.limits[kind] = Number(value);
      } else {
        if (!current) throw new Error(`instruction outside a method: ${line}`);
        current.lines.push(line);
      }
    } catch (error) {
      pending.push(`line ${index + 1}: ${error.message}`);
    }
  });
  if (pending.length) throw new Error(pending.join("\n"));
  if (!className) throw new Error("missing .class directive");

  const thisIndex = pool.classRef(className);
  const superIndex = pool.classRef(superName);
  const fieldBytes = fields.map((field) => Buffer.concat([
    u2(field.flags), u2(pool.utf8(field.name)), u2(pool.utf8(field.descriptor)), u2(0),
  ]));
  const methodBytes = methods.map((method) => {
    const { code } = encodeMethod({ ...method, items: methodItems(method.lines) }, pool);
    const codeAttribute = Buffer.concat([
      u2(method.limits.stack), u2(method.limits.locals), u4(code.length), code, u2(0), u2(0),
    ]);
    return Buffer.concat([
      u2(method.flags), u2(pool.utf8(method.name)), u2(pool.utf8(method.descriptor)),
      u2(1), u2(pool.utf8("Code")), u4(codeAttribute.length), codeAttribute,
    ]);
  });

  return Buffer.concat([
    u4(0xcafebabe), u2(0), u2(49),
    u2(pool.count), pool.serialize(),
    u2(classFlags), u2(thisIndex), u2(superIndex),
    u2(0),
    u2(fieldBytes.length), ...fieldBytes,
    u2(methodBytes.length), ...methodBytes,
    u2(0),
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error("usage: node scripts/jasm.mjs input.j output.class");
    process.exitCode = 2;
  } else {
    writeFileSync(output, assemble(readFileSync(input, "utf8")));
  }
}
