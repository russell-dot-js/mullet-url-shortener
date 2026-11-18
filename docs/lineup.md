# Lineup

The real implementation and four copies, each with one plausible defect, go through the same witnesses.
A copy is convicted only by a failed assertion in its named exhibit. A file that never loads is a mistrial.

## Real implementation: passes

| Exhibit | Verdict |
| --- | --- |
| sits every hearing in the statute, in order, and counts each one | acquitted |
| a forged check digit is refused at the JVM's custody, even though the payload is on the register | acquitted |
| every encode route agrees with the oracle | acquitted |
| POST /shorten answers 200 for a replayed cargo, with the same code | acquitted |

## Copies

| Copy | Defect | Convicted by | Verdict |
| --- | --- | --- | --- |
| M1 | the last hearing in the statute book is never sat | sits every hearing in the statute, in order, and counts each one | convicted |
| M2 | the JVM's verdict is ignored on the discharge path | a forged check digit is refused at the JVM's custody, even though the payload is on the register | convicted |
| M3 | the table route can never write the digit 'Z' | every encode route agrees with the oracle | convicted |
| M4 | a replayed cargo is not recognized and is registered a second time | POST /shorten answers 200 for a replayed cargo, with the same code | convicted |

## Credentials (the harness must refuse both)

| Credential | Claim | Result |
| --- | --- | --- |
| nodder | passes every exhibit without looking | refused: convicted 0 of 4 copies |
| thrower | fails before it has seen the evidence | refused: mistrial on the real implementation (exit 1): the exhibits were not all shown; convicted 0 of 4 copies |

Survivors: none

