# Vibrant Events

Responsive multi-page event discovery app with a Python API and MongoDB persistence. All website interface text is in English.

## One-time setup

1. Install **MongoDB Community Server** and **MongoDB Compass**. Compass is the GUI client; the Community Server is the database service.
2. Start the MongoDB Server Windows service.
3. Open this project folder in VS Code. The MongoDB Python driver is bundled in `mongo-driver.zip`; no Python package install is needed.

## Start the website

Run `python server.py` from the project folder, or double-click `start-backend.bat`. Then open `http://127.0.0.1:8765`.

By default, the app connects to `mongodb://127.0.0.1:27017` and uses the database `vibrant_events`. In Compass, enter that URI in the connection bar, click **Connect**, then refresh **Databases**. Expand `vibrant_events` to see the `events`, `users`, `bookings`, `plans`, and `sessions` collections. The app creates its collections and starter event records on first run. If MongoDB Server is not running, the app prints a connection error instead of silently saving data elsewhere.

For MongoDB Atlas, set the connection URI before starting the server in PowerShell:

```powershell
$env:MONGODB_URI = "mongodb+srv://<username>:<password>@<cluster>/"
python server.py
```

Do not share or commit a real connection string/password. Database name can be changed with `MONGODB_DATABASE`.

## Existing data

On its first successful connection, the app imports existing `vibrant-events.sqlite3` users, events, bookings, sessions, and plans into MongoDB. The import runs once. The original SQLite file is retained as a local backup.

## Separate account roles on the same website

The registration page lets each email address choose one role. After sign-in, Organizers go to the Organizer dashboard and Attendees go to event discovery. Both roles use the same site, event listings, and event details.

- **Organizer navigation:** Events and Organizer. Organizers can create, publish, update, and delete events they own, and view their attendees and dashboard metrics. Organizers can also update or delete shared starter events; changes affect the shared website for all users.
- **Attendee navigation:** Events, AI Picks, Plan Together, and My Bookings. Attendees can browse events, make demo bookings, view their bookings, and create collaborative event plans.
- **Both roles:** browse event details and use AI event recommendations. Opening a page or calling an API for the other role is blocked.

To use both sides, register two accounts with different email addresses and select a different account type for each.

## Pages and behavior

- `index.html` / `events.html` — event discovery, search, filters, sorting
- `event-details.html` / `checkout.html` — event details and demo booking confirmation
- `bookings.html` — signed-in user's bookings
- `organizer.html` / `create-event.html` — organizer metrics, event list, attendees, event publishing, and editing existing event details
- `ai-assistant.html` — context-aware event recommendations (no external generative AI provider)
- `plan-together.html` — shortlist, votes, and plan snapshots
- `login.html` / `register.html` — MongoDB-backed accounts with password hashing and Organizer/Attendee role selection

On the create-event page, type a custom category or choose a suggestion. An optional JPG, PNG, WEBP, or GIF image (up to 5 MB) is saved under `uploads/`, and its path is stored with the MongoDB event record.

To update an event, sign in, open **Organizer → My events**, choose **Edit**, change the fields, and click **Save changes**. An existing event image is retained unless you select a replacement. Ticket capacity cannot be lowered below the number of tickets already booked. The same list has a **Delete** action with a confirmation step; events with bookings are protected so ticket-holder records and event access are preserved. Deleting an event also removes it from saved group plans. Organizer analytics show all published events and calculate tickets, revenue, and unique attendees from confirmed attendee bookings in MongoDB.

Checkout records a booking only; it does not collect real money. Event photos load from Unsplash and need internet access. This local server is for development, not a public production deployment.
