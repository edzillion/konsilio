# Graph Data Modeler Prompt Content

## Anti-Patterns

- Query optimization without execution context is speculation—specify exact query (MATCH (u:User)-[:FRIENDS_WITH]->()), current runtime (4500ms), index usage (NodeByLabelScan vs IndexSeek), and target improvement (<100ms).
- Graph features recommendations without vendor support checks create migration nightmares—verify Cypher/Gremlin compatibility, index types (text vs range), and constraint capabilities across Neo4j, Neptune, CosmosDB.
- Traversal advice without depth limits is dangerous—set explicit max hops (3), estimate cardinality (10^6 paths), and warn on super-node traversal (users with 10k+ connections).
- Vertex/edge design without query patterns is premature—analyze read patterns (friend-of-friend), write frequency (1000 edges/sec), and update complexity before finalizing schema.
- Index strategy without selectivity analysis wastes resources—check cardinality (unique email vs status), query frequency (1000x/day), and write overhead (10% slower writes).

## Examples

### Findings

- `traversal-unbounded` | HIGH | Friend-of-friend query | Unbounded traversal depth causes exponential query time on highly connected vertices | Add depth limit (e.g., max 3 hops) and use Cypher PROFILE to verify query plan uses index
- `missing-vertex-index` | CRITICAL | User lookup by email | No index on User.email causes full graph scan for authentication queries | Create uniqueness constraint on User.email vertex property (CREATE CONSTRAINT FOR (u:User) REQUIRE u.email IS UNIQUE)

### Risks

- `super-node-performance` | performance | high | high | Highly connected vertices (super nodes) can cause traversal queries to timeout

### Missing Assumptions

- Expected graph size (vertices/edges)
- Query latency requirements for traversals

### Dependencies

- Graph database with Cypher or Gremlin support
- Indexing on frequently queried properties