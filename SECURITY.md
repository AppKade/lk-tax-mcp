# Security and privacy

This development preview serves stdio on the user's device. It has no network client, shell execution, URL-fetch tool, filesystem tool, telemetry, credential storage or persistent session store. Dependencies must be reviewed separately before distribution; this is not an operating-system network sandbox.

The tool schema accepts only booleans, bounded decimal strings and fixed workflow fields. Do not supply identifiers, employer names, bank/account/certificate details, raw documents or RAMIS credentials. Unexpected fields are rejected. Application errors use a fixed catalogue and never echo exception text. An output guard blocks sensitive field names and common NIC/TIN-shaped free text while preserving canonical decimal money values. Pattern matching cannot detect all identifiers, and cannot remove information already typed into host chat or inputs.

The user's host receives inputs and outputs, including amounts. A cloud host may send these to its provider. Other installed tools may access the conversation. Use a fully local host/model when that boundary matters. The server does not control the host's retention, logging or other tools.

All facts and consent live in memory. Restarting, starting a new session or wiping discards them. Wipe removes application references, not guaranteed physical memory erasure. There is no save/export/import path in this slice, so nothing is written as a tax-data file.

Every calculation revalidates current scope; missing exclusion answers cannot default to false. Unsupported scenarios refuse rather than silently omit income. Estimates are unreviewed and must not be used as filing outputs. Eligibility of donations, rent, solar claims and dividend finality is user-confirmed and is not independently verified; conflicting charity-cap results and dividend withholding mismatches stop calculation.

Report suspected vulnerabilities privately through GitHub's private vulnerability reporting if enabled, or contact the repository owner privately. Do not publish personal data, real certificates or credentials in issues.
