# Localization — strings still wanting a human eye

All 463 keys are translated in all 12 non-English locales with **no English
fallbacks**. The 8 keys below (24 locale-key pairs) were translated by NMT
(Lara) but keep scoring below the TowerInstruct QA threshold (80/100) across
three redrive passes — they're long or idiomatic UI strings that the offline
scorer won't bless regardless of engine. Not blocking launch; worth a
translator spot-check.

| key | locales flagged | English source (gist) |
|---|---|---|
| `login.passwordReset.checkInboxBody`   | 9 (es fr ar pt-BR fr-CA he de it tr) | "We'll email you a link…" |
| `homeschoolWelcome.stateFootnote`       | 4 (ar pt-BR fr-CA it) | homeschool state-reporting footnote |
| `settings.password.sentBody`            | 4 (pt-BR fr-CA he tr) | "Check your inbox for the reset link." |
| `homeschoolWelcome.welcomeSubtitle`     | 2 (ja tr) | homeschool welcome subtitle |
| `createScavengerHunt.difficultyLabel`   | 2 (ja ko) | "DIFFICULTY (1-4)" — the "(1-4)" trips the scorer |
| `onboarding.location.badge`             | 1 (ko) | onboarding location badge |
| `activity.reflect.savedBody`            | 1 (pt-BR) | "Your progress is saved…" |
| `wayfindingConsent.eyebrow`             | 1 (pt-BR) | consent-ladder eyebrow label |

To see the exact current translations:
```
grep -A2 'id="login.passwordReset.checkInboxBody"' i18n/xliff/*.xlf
```

After a manual fix: edit the `<target>` in the relevant `i18n/xliff/{code}.xlf`,
set that trans-unit's `<note>Status:` to `approved`, then
`python scripts/localize.py publish`.
