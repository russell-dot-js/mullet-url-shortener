// The route lottery. Every invocation draws one route uniformly at random, unless a pin names one.
// Pins come from MULLET_PIN="derive=hex,encode=table" or from the options object in tests.
import { derive } from "./derive.mjs";
import { encode } from "./encode.mjs";

export const ROUTES = { derive, encode };

export function parsePins(spec = "", routes = ROUTES) {
  const pins = {};
  for (const pair of spec.split(",").map((part) => part.trim()).filter(Boolean)) {
    const [operation, route, ...extra] = pair.split("=");
    if (!Object.hasOwn(routes, operation) || extra.length > 0 || !Object.hasOwn(routes[operation], route)) {
      throw new Error(`MULLET_PIN names no route: ${pair}`);
    }
    pins[operation] = route;
  }
  return pins;
}

export function draw(operation, { pins = {}, random = Math.random, routes = ROUTES } = {}) {
  if (!Object.hasOwn(routes, operation)) throw new Error(`no such operation: ${operation}`);
  const names = Object.keys(routes[operation]);
  if (pins[operation] !== undefined) {
    if (!names.includes(pins[operation])) throw new Error(`no route ${pins[operation]} for ${operation}`);
    return pins[operation];
  }
  return names[Math.min(names.length - 1, Math.floor(random() * names.length))];
}

export function pick(operation, options = {}) {
  const routes = options.routes ?? ROUTES;
  const name = draw(operation, { ...options, routes });
  return { operation, name, run: routes[operation][name] };
}
