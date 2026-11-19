# Canvas course launch

A student starts in a Canvas course and opens BuddyTech. BuddyTech verifies the
signed LTI 1.3 launch, resumes after its normal sign-in, and asks the student to
link their account the first time. The student lands in the configured Space.
The same BuddyTech account can reopen the Space from Canvas or from its normal
dashboard. Links match accounts using the verified LTI subject and deployment. A launch can add student membership and preserves any
existing role.

## Rehearse with the local LTI simulator

The simulator is a separate local process that sends correctly signed
LTI messages. It lets the team rehearse without running Canvas. Use localhost
consistently in the browser so the local launch cookies are same-site.

For the native BuddyTech setup, put these values in
`BuddyTech/Backend/port.env` alongside the usual MySQL and JWT settings.
Then run `npm run db:migrate`, start the backend and frontend, and start
`node scripts/canvas-lti-simulator.js` from `BuddyTech/Backend`.

```dotenv
APP_URL=http://localhost:5173
CANVAS_LTI_ISSUER=http://localhost:4400
CANVAS_LTI_AUTHORIZE_URL=http://localhost:4400/authorize
CANVAS_LTI_JWKS_URL=http://localhost:4400/jwks
CANVAS_LTI_CLIENT_ID=buddytech-local
CANVAS_LTI_DEPLOYMENT_ID=demo-deployment
CANVAS_LTI_COURSE_MAP={"cs3398-demo":1}
```

With Docker Desktop, start the simulator on the host, put the `CANVAS_LTI_*`
values in the repository root `.env`, and start the development Compose stack.
Set `CANVAS_LTI_JWKS_URL=http://host.docker.internal:4400/jwks` so the backend
container can find the host. The browser-facing issuer and authorization URL
still use localhost. The simulator binds to localhost by default. Its
`LTI_SIM_LISTEN_HOST` setting can bind to the Docker host interface if needed.

1. In a fresh browser session, open http://localhost:4400 and click **Open
   BuddyTech**.
2. Sign in or create a test BuddyTech account. Confirm **Link account and open
   Space**. The `1` in the example is CS 3398 in the standard seed data.
3. Launch again with that account signed in. The existing link opens the Space
   directly. Sign out and sign in through BuddyTech to see the Space in the
   normal dashboard.
4. Launch with a different BuddyTech account. The simulator represents the same
   Canvas student each time, so another local account should receive a conflict.

Restarting the simulator replaces its signing key. Open a new launch after a
restart. Use a clean demo database to rehearse initial linking again.

## Register on a self-hosted Canvas sandbox

Use an instance and demo course you administer. Instructure documents
[Docker development setup](https://github.com/instructure/canvas-lms/blob/master/doc/docker/getting_docker.md)
and [LTI registration](https://developerdocs.instructure.com/services/canvas/external-tools/lti/file.lti_dev_key_config).

- Register an **LTI** developer key at the sandbox root. Set the OIDC login
  initiation URL to `<BuddyTech URL>/api/lti/login`. Set the default target and
  registered redirect URL to `<BuddyTech URL>/api/lti/launch`.
- Enable a **Course Navigation** placement and use an **external window** for the
  launch. Install the tool by client ID and obtain its deployment ID. This
  prototype supports one registration and deployment per BuddyTech process.
- Use the sandbox issuer from Canvas `config/security.yml`, its OIDC
  authorization and public JWKS URLs, and the sandbox's client and deployment IDs.
  For cross-site launches, use HTTPS on BuddyTech so its state cookie can be
  returned in Canvas's form POST. The browser and the BuddyTech backend both
  need to be able to reach their respective sandbox URLs.
- Map the verified LTI `context.id` of the demo Canvas course to its existing
  BuddyTech course ID. A valid launch from an unmapped course logs that opaque
  context ID at the backend and stops before linking accounts.
- Repeat the rehearsal from a published course with an enrolled test student.
  The simulator verifies BuddyTech's launch flow. Real Canvas registration and
  browser compatibility require this separate sandbox test.

Canvas LTI is disabled when `CANVAS_LTI_ISSUER` is unset. Initiation and
continuation state are short-lived and held in one backend process. This pilot
grants student access for mapped courses and does not sync roster removals,
grades, assignments, or calendars.
