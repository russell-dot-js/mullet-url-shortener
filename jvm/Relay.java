import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintStream;

// The Relay is the JVM's counter. It reads one request per line from stdin and answers one line per request.
//   C <payload>            -> check slot for the payload
//   V <payload> <check>    -> 1 if the check slot matches the payload, else 0
// The arithmetic lives in Mint.class, which is assembled from jvm/Mint.j.
public class Relay {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, "UTF-8"));
        PrintStream out = new PrintStream(System.out, true, "UTF-8");
        out.println("ready");
        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.trim().split(" ");
            try {
                if (parts[0].equals("C") && parts.length == 2) {
                    out.println(Mint.checkIndex(Integer.parseInt(parts[1])));
                } else if (parts[0].equals("V") && parts.length == 3) {
                    out.println(Mint.verdict(Integer.parseInt(parts[1]), Integer.parseInt(parts[2])));
                } else {
                    out.println("error unknown request: " + line);
                }
            } catch (NumberFormatException e) {
                out.println("error not a number: " + line);
            }
        }
    }
}
