# Data Processing Agreement (District / School) — TEMPLATE

> **Not legal advice.** This is a starting-point template for the agreement
> between Peripateticware ("Provider") and a school or district ("LEA"). Have
> counsel review and adapt before signing. Bracketed `[…]` fields are to be
> completed per deal.

**Parties:** Peripateticware, [legal entity], ("Provider") and [LEA legal name]
("Local Educational Agency" or "LEA").
**Effective date:** [date]. **Term:** coterminous with the underlying service
agreement unless terminated earlier.

---

## 1. Purpose and role under FERPA

The LEA discloses "education records" (34 CFR § 99.3) to Provider so Provider can
deliver formative outdoor/peripatetic learning tools. Provider acts as a **"school
official" with a "legitimate educational interest"** under 34 CFR § 99.31(a)(1),
performing a service the LEA would otherwise perform with its own employees. The
LEA retains **direct control** over Provider's use and maintenance of education
records. Provider will not redisclose education records except as permitted by
FERPA and this DPA.

## 2. Ownership and use

All education records and student PII remain the property of the LEA (and, where
applicable, the student/parent). Provider claims no ownership. Provider will use
student data **only** to provide and support the service, and **never** for:
advertising or targeted advertising; building a commercial profile; selling or
renting data; or training third-party AI models on identifiable student data.

## 3. Data collected

Provider processes: student name and account identifiers; learning evidence
(text, audio, photo, video); optional field-activity geolocation; teacher-entered
assessment data; and parental-consent records. A current, detailed inventory is
maintained in the product's Data Protection Impact Assessment (available on
request; see `/api/v1/privacy/dpia`).

## 4. Parental / eligible-student rights

Provider will support the LEA in fulfilling rights to inspect, review, and request
correction of education records (34 CFR §§ 99.10–99.12) via the in-product Data
Subject Rights portal (`/dsr/*`) and administrative tooling. The LEA remains the
point of contact for parents/eligible students.

## 5. Security

Provider maintains reasonable administrative, physical, and technical safeguards
including: encryption in transit (TLS) and field-level encryption at rest for PII;
role-based access control and org-scoped authorization; short-lived authentication
tokens; audit logging of access to student data; and least-privilege operational
access. Provider will maintain a written information security program.

## 6. Data breach

Provider will notify the LEA without undue delay and no later than **[72] hours**
after confirming a breach affecting the LEA's student data, including the nature
of the incident, data categories involved, and remediation steps. Provider will
cooperate with the LEA's breach-response and notification obligations.

## 7. Retention and destruction

Provider retains student data only as long as needed to provide the service or as
directed by the LEA. On termination or LEA request, Provider will **delete or
return** all LEA student data within **[30] days** and certify destruction, except
where retention is required by law. Retention windows are enforced by the privacy
engine per applicable jurisdiction (strictest-wins).

## 8. Subprocessors

Provider uses subprocessors (e.g. cloud hosting, and — only if enabled by the LEA
— third-party AI inference providers) under written terms no less protective than
this DPA. A self-hosted inference option is available for LEAs that require student
data to remain on Provider infrastructure. Current subprocessor list available on
request; Provider will give notice of material changes.

## 9. No conditioning; data minimization

Provider will not condition participation on the collection of more personal
information than is reasonably necessary, and applies data minimization by design.

## 10. Compliance with state student-privacy laws

Provider will comply with applicable state student-privacy laws. See the addenda
below, which are incorporated where the LEA operates in the relevant state.

---

## Addendum A — California (SOPIPA, AB 1584, CalOPPA)

For California LEAs, Provider additionally warrants, per the Student Online
Personal Information Protection Act (SOPIPA, Cal. B&P Code § 22584) and Cal. Ed.
Code § 49073.1 (AB 1584):

- No targeted advertising to students based on covered information.
- No "amass a profile" of a student except in furtherance of K-12 school purposes.
- No sale or disclosure of covered information (subject to statutory exceptions).
- Pupil records remain the property of and under the control of the LEA.
- Reasonable security procedures and practices appropriate to the data.
- Deletion of a student's covered information at the LEA's request.
- Certification of the above in the district's public-facing agreement, as required.

## Addendum B — New York (Education Law § 2-d and Part 121)

For New York LEAs, Provider agrees to the requirements of N.Y. Education Law § 2-d
and 8 NYCRR Part 121, including:

- Adoption of and adherence to the LEA's Parents' Bill of Rights for Data Privacy
  and Security, and completion of the required supplemental information.
- Data will not be sold or used for marketing.
- Alignment of the security program with the **NIST Cybersecurity Framework**.
- Breach notification to the LEA in the most expedient way possible and without
  unreasonable delay, and no later than **7 calendar days** after discovery (§ 2-d).
- Subcontractor obligations flowed down; encryption of PII in motion and at rest.
- Return/deletion of PII on expiration of the agreement.

## Addendum C — Other states

Provider will comply with comparable student-privacy statutes where the LEA
operates (e.g. Colorado C.R.S. § 22-16, Connecticut P.A. 16-189, Illinois SOPPA
105 ILCS 85). Specific state addenda to be attached as applicable.

---

**Signatures**

Provider: ______________________  Date: __________
LEA:      ______________________  Date: __________
