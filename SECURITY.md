# Security Policy

## Supported Versions

Only the latest released version of RedisLens receives security patches.
We strongly recommend always running the most recent release.

| Version  | Supported          |
| -------- | ------------------ |
| Latest   | Yes                |
| < Latest | No                 |

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Instead, use one of the following methods to report the issue privately:

1. **Email**: Send a detailed report to [security@redislens.dev](mailto:security@redislens.dev).
2. **GitHub Security Advisories**: Navigate to the [Security](../../security) tab of
   this repository and click "Report a vulnerability" to submit a private advisory.

When reporting, please include:

- A description of the vulnerability and its potential impact.
- Detailed steps to reproduce the issue.
- The version of RedisLens you are using.
- Your operating system and version.
- Any suggested fix or mitigation, if applicable.

## Response Timeline

| Action               | Timeline                        |
| -------------------- | ------------------------------- |
| Acknowledgment       | Within 48 hours                 |
| Initial assessment   | Within 1 week                   |
| Fix for critical     | Within 30 days                  |
| Fix for non-critical | Best effort, typically < 60 days|
| Public disclosure     | After the fix is released       |

## Responsible Disclosure

We follow a 90-day disclosure timeline. If you report a vulnerability to us, we ask
that you allow up to 90 days from the date of the report before publicly disclosing
the details. This gives us time to develop, test, and release a fix. We will coordinate
with you on the disclosure date and credit you appropriately.

## Out of Scope

The following are considered out of scope for this security policy:

- **Redis server vulnerabilities** -- Issues in Redis itself should be reported to the
  [Redis project](https://github.com/redis/redis/security).
- **Social engineering attacks** -- Phishing, pretexting, or other non-technical attacks
  targeting RedisLens users or maintainers.
- **Denial of service against the desktop app** -- Crashes or resource exhaustion caused
  by intentionally malformed local input or extreme usage patterns.

## Credit

We believe in recognizing the efforts of security researchers. Unless you prefer to
remain anonymous, we will credit you by name (and link, if desired) in the published
security advisory and release notes. Please let us know your preference when reporting.
