# Photo OCR and Automatic Plate Linking Plan

## Status

**Planning only.** This document defines the approved implementation direction; it does not change the running bot.

## Goal

Replace manual `/car` tagging with automatic indexing from **new Telegram photo messages** in the allow-listed auto-service group.

The group contains both:

- photos of completed vehicles, where a plate is visible in the vehicle image; and
- photos of order/work documents (`заказ-наряд`), where the plate may appear as printed text.

For each new photo, the bot will identify zero or more valid vehicle plates and create the same private, chat-scoped links that `/find` and `/list` use today:

```text
plate AA1234BB
  -> link to the exact Telegram photo message that showed the car or document
```

A plate can therefore link to both the vehicle photo and its related order-document photo. The bot will not infer ownership, a driver, or a vehicle identity beyond the recognized plate token.

## Non-goals and boundaries

- Process **photos only**. Do not process ordinary text, captions, videos, animations, video documents, PDFs, or historical group media.
- Do not store original Telegram media, a Telegram export, or full document text.
- Do not create cross-chat search or expose a result outside its source chat.
- Do not query state, commercial, or third-party vehicle-owner databases.
- Do not automatically index low-confidence or invalid OCR guesses.
- Existing `/car` history stays searchable. `/car` will be removed only after automatic indexing passes the live acceptance test.

## Current implementation and target behavior

| Area | Current bot | Target bot |
| --- | --- | --- |
| Creating an index record | Worker types `/car <plate>` | Bot reads valid plate(s) from each received photo |
| Vehicle photo | Optional manual caption/tag | Detect plate region, crop it, recognize characters |
| Order-document photo | Optional manual caption/tag | Full-image document OCR, then extract and validate plates |
| Text/caption/video handling | Used by `/car` paths | Ignored for indexing |
| Stored record | plate, message link, compact preview, media metadata | Same record shape; preview is `Фото авто` or `Фото заказ-наряду` only when confidently classified, otherwise `Фото` |
| Search | `/find` and `/list`, scoped by `chat_id` | Preserved, including historical entries |

## Proposed local recognition architecture

The recognizer must be local and deterministic enough for identifiers. A general vision LLM, including Ollama, is **not** the primary OCR path: it can hallucinate characters and does not reliably return plate coordinates/confidence.

```text
Telegram message:photo
  -> authorize chat
  -> select largest Telegram PhotoSize
  -> securely download to a unique temporary directory
  -> local Python analyzer (one job at a time)
       -> vehicle-plate detector
       -> crop every detected plate region
       -> plate OCR
       -> whole-image document OCR
       -> candidate normalization + strict plate validation
       -> confidence / provenance result JSON
  -> TypeScript validates output again
  -> SQLite: one record per (plate, chat, message URL)
  -> delete temporary photo and crop files in finally block
```

### Analyzer components

1. **Plate detector:** a compact YOLO-family model trained specifically to locate registration plates. It returns bounding boxes and detector confidence. This is the crop stage for vehicle photos.
2. **Plate OCR:** PaddleOCR (or benchmark-proven equivalent) runs only on each detector crop. Image preprocessing may include perspective correction, upscale, contrast enhancement, and a second OCR pass for borderline candidates.
3. **Document OCR:** PaddleOCR runs on the full photo and detected text regions so a plate printed on an order/work document can be extracted even when no physical plate is visible.
4. **Decision layer:** normalize Ukrainian/Cyrillic lookalikes, remove OCR separators only inside the analyzer candidate pipeline, validate against the existing explicit country formats, deduplicate candidates, and require thresholds for both detector/OCR evidence.

The analyzer returns structured JSON only; it never writes image files or plate data to a permanent analyzer-side database:

```json
{
  "detections": [
    {
      "plate": "AA1234BB",
      "confidence": 0.96,
      "source": "plate_crop",
      "box": { "x": 120, "y": 310, "width": 360, "height": 92 }
    },
    {
      "plate": "AA1234BB",
      "confidence": 0.93,
      "source": "document_ocr"
    }
  ]
}
```

If the same normalized plate is found through both paths, retain one result with the strongest confidence and record the Telegram message once.

## Record and privacy policy

The existing `indexed_messages` uniqueness constraint—`(plate, chat_id, message_url)`—already models the desired link: one exact photo message may contain multiple plates, and the same plate may occur in many messages.

The implementation must retain these invariants:

- download only while analyzing; delete all original/temp/crop files on success, rejection, timeout, and exception;
- store only the normalized plate, source chat, message URL, timestamp, media type, and bounded preview label;
- never store raw OCR text, raw confidence diagnostics, image bytes, coordinates, captions, or an image hash in the production index unless separately approved;
- telemetry may contain safe operational events such as `photo analyzed`, detection count, duration bucket, and failure code—never media URLs, captions, or OCR text;
- apply a per-photo timeout and a bounded sequential queue so an unusually large or difficult photo cannot exhaust the Mac mini;
- process only `ALLOWED_CHAT_IDS` before downloading any media.

## Phased implementation plan

### Phase 0 — verify delivery and protect the current service

1. Confirm the bot receives ordinary `message:photo` updates in the intended group after Group Privacy is disabled.
2. Send controlled examples: a one-photo vehicle message, a one-photo order document, and a multi-photo Telegram album.
3. Confirm every album member arrives as an independent `message:photo` update with a shared `media_group_id`.
4. Do not run a second long-polling process; preserve the existing LaunchAgent as the only poller.

**Exit criterion:** receipt telemetry proves that every required photo shape reaches the production bot.

### Phase 1 — make a disposable benchmark

1. Collect a consented, temporary representative sample of current workflow photos, divided into:
   - clear/angled/distant/blurred vehicle plates;
   - day/night/glare examples;
   - legible and poor-quality order/work document photos;
   - Ukrainian plates and the currently supported foreign formats.
2. Create a local ground-truth list of expected plate tokens per image.
3. Keep this sample outside Git and delete it after model selection unless explicitly retained as a secured test fixture.
4. Measure each candidate pipeline on:
   - plate detection recall;
   - exact normalized plate accuracy;
   - false-positive count;
   - missed document plates;
   - median and worst-case processing time on the production M2 Pro;
   - memory/disk footprint.

**Exit criterion:** select the smallest local detector/OCR combination that meets a documented accuracy target on real service images. Do not rely on generic benchmark claims.

### Phase 2 — build an isolated analyzer contract

1. Add a Python analyzer in a separate directory with a pinned virtual environment and explicit model locations.
2. Give it a narrow CLI/API contract: input photo path, JSON on stdout, diagnostic error on stderr, non-zero exit on failure.
3. Add pure tests for candidate normalization, country validation, deduplication, threshold behavior, and malformed analyzer output.
4. Add an analyzer timeout, a maximum input size/pixel guard, and guaranteed temporary-directory cleanup.
5. Process jobs sequentially first. Add a small bounded queue only after real throughput measurements show it is required.

**Exit criterion:** the analyzer can run repeatedly on the benchmark without retaining media and returns stable, validated JSON.

### Phase 3 — integrate the TypeScript bot

1. Add a `message:photo` handler only; it must authorize the chat before file download.
2. Select the largest `PhotoSize`, obtain the file through the Telegram API, and download it into a unique temporary directory with restrictive permissions.
3. Run the local analyzer with a timeout; validate every returned plate again through `normalizePlate` in TypeScript.
4. Use the existing indexing path to save every accepted plate against the **source photo message URL**. A single photo may create multiple plate records.
5. Retain the existing `/find`, `/list`, database migration guarantees, chat isolation, and old `/car` records.
6. Initially log accepted/rejected detection counts and failure categories without logging recognized strings or image/caption content.

**Exit criterion:** a controlled photo and a controlled order-document image each create search results linking to their own exact Telegram message.

### Phase 4 — tune for precision and group UX

1. Set documented acceptance thresholds separately for:
   - detector-crop OCR;
   - document-OCR text candidates;
   - candidates where both mechanisms agree.
2. Default to **precision over recall**: uncertainty means no index record, not a guessed plate.
3. For a single photo, stay silent by default after successful indexing to avoid clutter. Log operationally.
4. For albums, process every member independently. Do not delay or combine indexing; a future optional album summary may be considered only after normal operation is proven.
5. Establish an operator review workflow for misses/false positives using the original Telegram message; do not add permanent image storage for review.

**Exit criterion:** live testing shows no unacceptable index pollution, and recognized results are useful through `/find`.

### Phase 5 — retire manual indexing and deploy safely

1. Remove `/car` from `src/commands.ts`, handlers, tests, README, AGENTS guidance, and the maintenance runbook.
2. Remove text/caption/video/animation/document indexing handlers while leaving `/find`, `/list`, `/start`, and callback handling intact.
3. Preserve existing database rows created by `/car`; do not rewrite or delete history.
4. Add the analyzer environment/model configuration to `.env.example` without secrets, and update the LaunchAgent environment/setup instructions.
5. Run all unit tests, typecheck, lint, the analyzer benchmark, and the real group acceptance test before enabling the new handler in production.
6. Back up the SQLite database before deployment; restart only through the LaunchAgent and verify one process is polling.

**Exit criterion:** `/car` is absent from Telegram's registered command menu and from source, while `/find` returns links for newly received vehicle and order-document photos.

## Required tests

### TypeScript bot tests

- allow-list check occurs before download/analyzer invocation;
- only `message:photo` enters automatic indexing;
- largest photo representation is selected;
- one photo with multiple accepted plates creates multiple records;
- duplicate plate candidates in one photo create one record;
- a valid analyzer result links to the exact source message and remains chat-scoped;
- low-confidence, invalid, malformed, timeout, and analyzer-error results create no records;
- temporary files are removed on all result paths;
- a multi-photo album processes each photo message independently;
- historical `/car` rows remain searchable after the change;
- `/find`, `/list`, callbacks, and long-poll `allowedUpdates` regressions are covered.

### Analyzer benchmark gates

Before the feature is enabled, record the benchmark version, input categories, selected models, thresholds, and observed metrics. The rollout decision must be based on exact plate accuracy and false positives on the service's real photo style, not a single demo image.

## Rollout and rollback

1. Take a WAL-safe SQLite backup.
2. Deploy the analyzer and bot code without enabling automatic writes; run a controlled test group/photo check first.
3. Enable automatic indexing only for the existing allow-listed production chat.
4. Verify `/find` links for one vehicle photo and one order-document photo.
5. Monitor safe counters and error logs for several days.
6. If a model, threshold, or integration is wrong, stop the LaunchAgent, restore the previous Git revision, restart it, and retain the database. Since the change is additive to the existing record format, rollback does not require deleting historical records.

## Open decisions to settle during Phase 1

These are deliberately deferred until benchmark evidence exists:

- the exact detector weights and OCR package/version;
- accepted countries beyond the current explicit validator;
- confidence thresholds and whether two independent OCR passes should be required for document photos;
- whether a clearly classified preview label (`Фото авто` / `Фото заказ-наряду`) is accurate enough to store; default is generic `Фото`;
- retention of any secured benchmark samples beyond model selection.

## Definition of done

The work is complete only when all of the following are true:

- the bot processes new ordinary photo messages from the intended allow-listed group;
- it reads plates both from vehicle plate crops and printed order/work document photos;
- only valid, high-confidence normalized plate values are indexed;
- `/find <plate>` returns direct links to the correct source messages in the same chat;
- no original images, crops, captions, or full OCR text are retained;
- `/car`, text, and video indexing are removed, while historical `/car` entries remain searchable;
- unit tests, typecheck, lint, benchmark evidence, and live group acceptance checks pass;
- the production LaunchAgent is the only active poller and has been verified after deployment.
