# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Report them privately through **Security → Report a vulnerability** in this repository. Include what is affected, how to reproduce it and the impact you expect.

You will get an answer as soon as possible. Once the problem is fixed, the report can be made public with credit to you if you want.

## Scope

Agent Office is a **local, single-user** tool (see the Security section of the [README](README.md#security)). Reports are especially welcome about:

- The link port (`/o/<office>/link/`): authentication, tokens and anything that reaches `/api`, `/ws` or `/internal` through it.
- Agent permissions: a `read` or `edit` agent escaping its project folder or running commands it should not.
- Credentials (API keys, tool connections) reaching the browser, the logs or another office.
- Remote servers or linked offices running something outside the closed command catalogue.

Exposing the interface to the Internet without protection is outside the supported setup.
