# Supabase public root CA

`supabase-prod-ca-2021.crt` was supplied by the project owner from Supabase's project dashboard.
It is a public trust certificate, not a private key or account credential.

- Subject/issuer: Supabase Root 2021 CA, Supabase Inc
- Valid: 2021-04-28 through 2031-04-26
- SHA-256 fingerprint: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`

`config.js` supplies this CA to pg with certificate and hostname verification enabled.
An optional `DATABASE_CA_CERT` environment variable overrides it for a reviewed replacement.
Never replace it with a certificate obtained from an unverified database connection.
