# COPPA Direct Notice to Parents & Consent Method

> Not legal advice — review with counsel. This documents (a) the direct notice
> given to parents of children under 13, and (b) the verifiable parental consent
> (VPC) method Peripateticware uses. Publish the parent-facing parts on the
> landing/privacy pages and link them from the consent email.

## Who this applies to

Children under 13 in the United States, per the Children's Online Privacy
Protection Act (COPPA, 16 CFR Part 312). Students cannot self-register; an
under-13 account created by a teacher stays **inactive** until a parent/guardian
provides verifiable consent.

## What we collect from a child, and why

- First name and account identifier — to create and operate the learning account.
- Learning evidence the child submits (text, and — if the teacher enables it —
  audio, photo, video) — for formative assessment and teacher review.
- Optional field-activity location — only if separately enabled and consented,
  for outdoor-activity mapping.

We do **not** use children's data for advertising or marketing, do **not** sell
or share it, and do **not** use persistent identifiers to track children across
services. We collect no more than is reasonably necessary for the activity, and
never condition participation on providing more data than needed.

## Our verifiable parental consent (VPC) method

1. When a teacher adds an under-13 student, the account is created **inactive**
   and flagged `requires_parental_consent`.
2. The system emails the parent/guardian address a **single-use, cryptographically
   signed consent link** (HMAC-signed token, 72-hour expiry, consumed on use).
3. The parent reviews this notice and consents on the linked page. The token is
   validated and burned server-side; the child's account is then activated.
4. Consent is recorded (jurisdiction, type, version, timestamp) and can be
   **withdrawn** by the parent at any time, which deactivates the account and
   triggers deletion per our retention policy.

> **Method note / FTC guidance:** email-plus-token is at the lighter end of the
> FTC's accepted VPC methods and is appropriate for the internal school context.
> If you begin using children's data beyond internal educational use, upgrade to
> a stronger VPC method (e.g. signed consent form, credit-card/ID check, or a
> knowledge-based verification step) before doing so. This is a launch decision
> to confirm with counsel.

## Parent rights

Parents/guardians may, at any time: review the personal information collected from
their child; refuse to permit further collection or use; and request deletion.
Requests are handled via the in-product Data Subject Rights portal or by
contacting [privacy@peripateticware.com].

## Retention

Children's personal data is retained only as long as needed for the educational
purpose (default 6 months for personal data, 12 months for learning-activity
data), then deleted — consistent with the COPPA jurisdiction rule
(`config/jurisdictions/coppa_us.json`).

## Landing / privacy page copy (short version to publish)

> **For families of children under 13.** Students under 13 can only join through
> a teacher, and their account stays locked until a parent approves it through a
> secure, single-use link we email you. We collect only what's needed for
> learning, never show ads, never sell data, and you can review or delete your
> child's information anytime. Read the full notice: [link].
