<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## JWT authentication pattern

This project keeps credentials and authentication in one feature module. For a
new NestJS project, copy `src/modules/auth/` and register `AuthModule` in the
root module. Change the profile fields in the `User` entity and `RegisterDto` to
match that project's user model.

### Responsibilities and request flow

- `AuthModule` owns its `User` entity, repository, JWT setup, controller, service,
  and guard. Other modules consume the exported `JwtAuthGuard`.
- Registration normalizes the email, hashes the password with bcrypt, stores
  only the hash, and issues tokens. The database unique constraint handles
  concurrent duplicate registrations.
- Login queries the password hash explicitly (it is excluded from normal entity
  queries) and returns the same generic error for an unknown email or bad
  password.
- Access tokens are short-lived and signed with the access secret. The guard
  verifies the signature, expiry, and `tokenType`, then sets `request.user`.
- Refresh tokens use a different secret and longer expiry. The database stores
  only a SHA-256 digest of the current high-entropy refresh token. Refresh
  verifies the JWT, compares its digest in constant time, and rotates it; reusing
  a rotated token fails. (Bcrypt is used for passwords, not JWTs, because bcrypt
  truncates input beyond 72 bytes.)
- Logout clears the stored refresh hash. Existing access tokens remain usable
  until their short expiry; use a token-version/revocation store if immediate
  access-token revocation is required.

The baseline stores one refresh token per user, so a new login invalidates that
user's previous refresh token. For multiple concurrent devices, use a separate
session entity/table with one hashed refresh token per session, plus expiry and
revocation fields.

### Configure and run

Copy `.env.example` to `.env`, set the database values, and replace both JWT
secrets with different cryptographically random values of at least 32
characters. Keep `.env` out of source control and use a secrets manager in
production. The example values are placeholders, not production credentials.

The access token defaults to 15 minutes and the refresh token to 7 days. All
passwords must be at least 12 characters. Apply the entity changes with a
database migration before deploying; leave `DB_SYNCHRONIZE=false` in production.

### HTTP API

All routes use the existing global `/api/v1` prefix.

| Method | Route | Auth | Body / result |
| --- | --- | --- | --- |
| `POST` | `/api/v1/auth/register` | Public | `{ "firstName", "lastName", "email", "password" }` → token pair |
| `POST` | `/api/v1/auth/login` | Public | `{ "email", "password" }` → token pair |
| `POST` | `/api/v1/auth/refresh` | Public | `{ "refreshToken" }` → rotated token pair |
| `POST` | `/api/v1/auth/logout` | Access token | Revokes the stored refresh token |
| `GET` | `/api/v1/auth/me` | Access token | Current user's public profile |

Send access tokens as `Authorization: Bearer <accessToken>`. In browser apps,
prefer a Secure, HttpOnly, SameSite refresh-token cookie over local storage;
add CSRF protection when using cookies. Do not log either token.

### Protect another module's route

Import `AuthModule` into the feature module (or a shared security module), then
apply `@UseGuards(JwtAuthGuard)` to a controller or route. Inject the request
with the `AuthenticatedRequest` type to read `request.user.userId`. Keep public
routes unguarded. Use authorization checks in addition to authentication for
resource ownership and roles.

## Redis caching pattern

Redis is an optimization, never the source of truth. MySQL remains authoritative;
when Redis is down or a cache operation fails, requests continue through the
database path. The current implementation uses cache-aside for public user
profiles (60 seconds) and URL destinations (300 seconds), and maintains an
approximate top-URL leaderboard in a Redis sorted set.

### Local Docker setup

1. Copy `.env.example` to `.env`; set a strong local `REDIS_PASSWORD` and put
  the same password in `REDIS_URL`. URL-encode special characters in the URL.
2. Start Redis with `docker compose up -d redis` and verify it is healthy with
  `docker compose ps`.
3. Start the API with `npm run start:dev`. If Redis is unavailable, the API
  starts and bypasses cache reads/writes; check logs for connection warnings.
4. Stop the local service with `docker compose down`. The named volume preserves
  local Redis data; `docker compose down -v` deletes it.

Compose binds Redis only to loopback, requires a password, enables AOF, and
defines a health check. This is a local-development setup—not a production Redis
deployment. In production, use a managed Redis service or a secured private
network, TLS, ACLs, secret management, backups appropriate to the data, memory
limits, and monitored failover. Do not expose Redis publicly.

### What this app caches

- `users:profile:<userId>` contains only the public profile shape, never a
  password hash, refresh-token hash, or token. It expires after exactly 60
  seconds. Invalidate this key whenever profile fields are changed or a user is
  deleted; the current logout also clears it.
- `urls:destination:<shortCode>` contains the validated destination for five
  minutes. URL edits/deletes invalidate it. The TTL bounds stale data if an
  invalidation is missed; a small race between a concurrent read and mutation is
  still possible, so shorten the TTL or use versioned keys if tighter
  consistency is required.
- `urls:popularity` is a sorted set updated on both cache hits and database
  misses. It retains at most 1,000 codes and `/api/v1/shortcode/most-accessed`
  returns the top 10 in ranked order. This leaderboard is approximate and can
  reset/lose ranking history; do not use it for billing, security, or analytics
  that require exact durable counts.

### Reusable steps for another NestJS project

1. **Define the boundary.** Choose which response fields are safe to cache, the
  key namespace, TTL, invalidation events, maximum cache size, and whether Redis
  failure should fall back to the database. Keep credentials and personal data
  out unless there is a specific security-reviewed need.
2. **Add infrastructure and configuration.** Add a Redis client package, a
  global `RedisModule` with one managed connection, URL/credential settings,
  bounded reconnect delays, a shutdown hook, and an error listener. For local
  work use Compose with authentication, loopback-only ports, health checks, and
  a named volume. Production should use private networking, TLS/ACLs, managed
  secrets, capacity limits, and failover.
3. **Wrap Redis calls.** Put JSON serialization, TTLs, metrics/logging, and
  error handling behind a small cache service. Avoid raw client calls scattered
  across controllers. Decide explicitly whether each operation is fail-open or
  fail-closed; ordinary read caches are normally fail-open.
4. **Use cache-aside reads.** Read the cache, validate a hit, otherwise query the
  primary database, cache the safe result with an explicit TTL, and return it.
  Add request coalescing/locking only if measurements show a cache-stampede
  problem. Never cache a “not found” response without an intentional short TTL
  and invalidation policy.
5. **Invalidate after writes.** Commit the database change first, then delete or
  refresh all affected keys. Document the bounded-staleness window and handle
  invalidation failure with TTLs, an outbox/event retry, or versioned keys where
  stronger consistency is required. Do not assume deleting one key updates
  other derived or list caches.
6. **Design for bounded resources.** Set TTLs on every cache entry, cap
  cardinality, choose an eviction policy and memory budget, and namespace keys
  by service/environment/schema version. Avoid unbounded lists and large
  serialized entities. Use Redis data structures with atomic commands for
  counters/rankings.
7. **Protect and observe it.** Use TLS and least-privilege ACLs outside local
  development, never log secrets or cached payloads, and monitor hit/miss
  rates, Redis latency/errors, memory/evictions, reconnects, and database load.
  Alert on sustained Redis failure and test whether the database can handle
  cache-cold traffic.
8. **Test both paths.** Unit-test hit, miss, expiry assumptions, invalidation,
  malformed cache data, and Redis failures. Integration-test against a real
  Redis version. Load-test cold starts and hot keys; include authorization and
  tenant boundaries in cache keys when data is not public.

Cache key/value formats and TTLs are part of the application contract. Version
them during deployments when serialized shapes change, and do not rely on a
cache for durable state.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

To add it to this project:

```bash
$ npm install @nestjs/observe
```

Then follow the [setup guide](https://docs.nestjs.com/observability/overview) - it takes a single import and an app key.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
