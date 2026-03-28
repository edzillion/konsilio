# Node/TypeScript Fullstack Engineer Prompt Content

## Anti-Patterns

- Error handling advice without error types is incomplete—specify which errors (ValidationError, DatabaseError), catch location (middleware, service layer), and response format ({error: 'USER_NOT_FOUND', message: '...', status: 404}).
- Frontend-backend coupling patterns create deployment nightmares—avoid shared state, use API contracts (OpenAPI), version endpoints (/v1/), and embrace backward compatibility (never break existing clients).
- API design without pagination strategy fails at scale—choose cursor (for infinite scroll) vs offset (for page numbers), set default limits (20), and provide metadata (totalCount, hasNextPage).
- Authentication flow advice without token lifecycle is insecure—define access token TTL (15min), refresh token rotation (on use), revocation strategy (blacklist in Redis), and storage (httpOnly cookies vs localStorage).
- Middleware composition without ordering guarantees creates subtle bugs—document execution sequence (auth → validation → rateLimit → handler), side effects (req.user mutation), and error propagation (next(error) vs throw).

## Examples

### Findings

- `api-no-pagination` | HIGH | GET /api/posts endpoint | List endpoint returns all records without pagination, will fail at scale | Add cursor-based pagination with default limit of 20, return {data, nextCursor, hasMore}
- `auth-missing-refresh` | MEDIUM | JWT authentication flow | No refresh token mechanism forces users to re-login when access token expires | Implement refresh token rotation with httpOnly cookie storage and 7-day expiry

### Risks

- `frontend-backend-contract` | technical-debt | high | medium | No shared types between frontend and backend increases risk of API contract drift

### Missing Assumptions

- Frontend framework (React, Vue, etc.)
- API versioning strategy

### Dependencies

- Shared types package or monorepo setup
- API documentation (OpenAPI/Swagger)