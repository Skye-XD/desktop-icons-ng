# Widget Content Security Policy (CSP)

## Overview

This document describes the **Content Security Policy (CSP)** profiles used by the desktop widget platform, what they allow, what they block, and how they are intended to be used.

CSP is a critical part of the platform’s **defense-in-depth** approach. It helps reduce accidental damage and limits obvious abuse, but it does **not** provide absolute security.

---

## User-facing warning

⚠️ **Important security notice**

Widgets execute code and run in your user session.

While the platform applies isolation, sandboxing, and CSP restrictions, a **malicious widget can still cause harm**. CSP makes certain classes of attacks harder, but it does not make untrusted code safe.

**Do not install widgets you do not trust.**

If you would not run the code as a local application, you should not run it as a widget.

---

## CSP profiles

The platform defines CSP behavior using **enumerated security profiles**. Each profile maps to a concrete CSP string that is injected into responses served to widgets.

The profiles exist to make CSP behavior explicit, auditable, and adjustable without scattering security decisions throughout the codebase.

At present, widgets always run using the **Strict** profile by default.

---

## CSP profile summary

| Profile        | Intended use                | Security level | Recommended |
|----------------|-----------------------------|----------------|-------------|
| Strict         | Default / production        | High           | ✅ Yes      |
| Development    | Local testing / debugging   | Medium         | ⚠️ Caution |
| Relaxed        | Experimental / prototyping  | Low            | ❌ No       |

---

## Strict CSP (default)

The **Strict** profile is designed for normal users and production use.

### Allows

- loading widget content from the widget’s own origin
- explicit loading from the jailed `ding-widget:` scheme used for bundled widget assets
- JavaScript execution inside the widget context
- CSS and layout required for rendering
- network requests (HTTP/HTTPS) initiated by widget code
- images and media loaded by the widget
- communication with the host via the injected widget API
- Strict allows inline scripts/styles because the platform injects bootstrap code and expects simple widget authoring

### Blocks

- loading external scripts from remote CDNs
- loading external stylesheets from remote CDNs
- use of unexpected URI schemes
- filesystem access outside the widget’s directory
- symlink traversal
- path traversal
- dynamic code injection via `eval`-style mechanisms, frames, workers, etc.

### Rationale

The strict profile is intentionally conservative. It supports common, legitimate widget use cases while blocking patterns that frequently lead to security issues or abuse in web-based environments.

In the generated policy, local widget resource directives explicitly include `ding-widget:` so bundled scripts, styles, images, fonts, media, and `fetch()` requests continue to work reliably under WebKit's custom-scheme handling.

---

## Development CSP

The **Development** profile exists for local development and debugging.

### Allows

- everything allowed by the Strict profile
- additional script flexibility useful during development
- relaxed restrictions to support debugging tools

### Blocks

- obvious unsafe behaviors unrelated to development
- access outside the widget’s directory
- kernel-level or system-level resources

### Warnings

This profile reduces protection and should **not** be used for distributed widgets. It is intended for trusted, local development only.

---

## Relaxed CSP

The **Relaxed** profile is intended only for experimentation.

### Allows

- most behaviors typically blocked by CSP
- broad script and resource loading
- maximum flexibility for rapid prototyping

### Blocks

- only the most dangerous behaviors that would immediately compromise the host

### Warnings

This profile significantly weakens isolation and should **never** be used for untrusted widgets. It exists primarily to support early experimentation and testing.

---

## CSP strings and enums

CSP profiles are defined using internal **enums**, which map directly to generated CSP strings.

This design ensures that:
- CSP rules are centralized
- changes are explicit and reviewable
- the platform can evolve security policy without breaking API contracts

Changing the active CSP profile changes the generated CSP string applied to widget content.

At present, the platform always selects the **Strict** profile.

---

## Why CSP is not enough

CSP is only one layer of protection.

Even with CSP:
- widgets still execute JavaScript
- widgets may access the network
- widgets run with user privileges
- malicious logic can still cause harm

CSP is designed to reduce risk, not eliminate it.

---

## Trust model

The platform assumes:
- widgets are installed intentionally
- users trust the widgets they install
- widget authors act in good faith

Security features exist to limit damage from mistakes and reduce obvious abuse, not to make running untrusted code safe.

---

## Summary

- CSP is a **risk-reduction tool**, not a security guarantee
- The **Strict** profile is the default and recommended mode
- More permissive profiles exist but should be used cautiously
- Users are responsible for deciding which widgets to trust

This approach balances flexibility, safety, and desktop stability without pretending to offer absolute security.
