# 10 — Creative media and privacy

## Sprint 1: drawings and text only

- **Drawings are data, not files:** `strokes: { c: colorIndex(0–3), w: 1|2, p: number[] }[]`, coordinates as
  integers 0–600. zod-validated server-side (numbers only, ≤ 300 strokes, ≤ 8,000 points, ≤ 64 KB).
  Rendered as SVG `<path>` built by our code: no user markup, no images, nothing executable.
- Stored in `chaos_contributions` (Postgres), deleted with the room under the existing retention policy
  (30 days after the room expires). Never copied to analytics. No public URLs.
- Text fallback: length-limited, cleaned with the existing `cleanText`.
- Report/leave/kick controls apply as in Quick Party.

## Sprint 6: audio and camera (feature-flagged, separately approved)

| Topic                  | Default proposal                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Permission             | Asked just in time, with a reason; denial ⇒ text/draw path, never a dead end                                |
| Audio                  | MediaRecorder ≤ 5 s, format detection (Safari/Chrome), review/re-record, no transcription or judging        |
| Camera                 | Photo of an _object_ (not people); preview/retake; resize to ≤ 1024 px; strip EXIF/location; stock fallback |
| Storage                | Private Supabase Storage bucket; access only through short-lived signed URLs issued per room member         |
| Retention              | Deleted with the room (30 days after expiry) unless the group explicitly saves it (needs accounts)          |
| Consent to save/re-use | Per-artifact, by its creator, revocable; default **off**                                                    |
| Moderation             | Report button on every artifact; host can hide; scanning plan before public sharing exists                  |
| Analytics              | Only `media_permission_denied` and counts; never media or URLs                                              |

Retention defaults and consent rules must be owner-approved before any destructive cleanup of media
([13](13-decisions.md), #3).
