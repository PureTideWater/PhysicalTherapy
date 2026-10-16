---
policy: workforce-and-device
title: Workforce and device
version: 0.1
status: draft, awaiting the security official's approval
owner: security official
review: yearly
---

# Workforce and device policy

## Purpose and scope

What everyone who works for the company (employees, contractors, specialists) does to keep customer data safe, and
the devices they work from.

## Training

- Security and HIPAA training at hire, before any access is granted, and yearly after that: this program's policies,
  the break-glass path, phishing, reporting an incident, and the rule that real data never leaves production.
- Each person attests yearly that they completed the training and that their devices meet this policy; the
  attestation is recorded in the console (Compliance, kind "training attestation", one per person).

## Devices

- Full-disk encryption on, a screen lock of five minutes or less, the operating system and browser kept current, and a
  password manager for every credential.
- Internal roles sign in with a hardware security key; the key is not shared.
- **No PHI on a laptop or any personal device, ever.** Customer data is reached only through the application and the
  break-glass path. Debugging uses synthetic data and twins made inside production; a real file is never downloaded,
  pasted into a tool, attached to a ticket, or shared with a model outside the product's gateway.
- A lost or stolen device is reported to the security official at once; its sessions and keys are revoked.

## Sanctions

A breach of this policy is handled under the company's disciplinary process, proportionate to the harm, and recorded.

## Leaving

On a person's last day their internal roles, sessions, keys and accounts are ended, and company devices are returned
and wiped.
