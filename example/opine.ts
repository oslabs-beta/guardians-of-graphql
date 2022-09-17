import {
  opine,
  OpineRequest,
  GraphQLHTTP,
  makeExecutableSchema,
  gql,
  readAll,
} from "../deps.ts";
import { guarDenoQL } from "../mod.ts";

type Request = OpineRequest & { json: () => Promise<any> };

// RUN COMMAND
// deno run --allow-read --allow-net examples/opine.ts

const typeDefs = gql`
  type Query {
    posts: [Post]
    post(id: ID!): Post
  }

  type Post {
    id: ID!
    title: String!
    related: [Post]
  }
`;

const posts = [{id: "graphql", title: "Learn GraphQL!"}];

const resolvers = {
  Query: {
    posts: () => posts,
    post: (_parent: any, args: { id: string }) => posts.find((post) => post.id === args.id),
  },
  Post: {
    related: () => posts,
  },
};


const dec = new TextDecoder();

const schema = makeExecutableSchema({ resolvers, typeDefs });

const app = opine();

app
  .use("/graphql", async (req, res) => {
    const request = req as Request;

    request.json = async () => {
      const rawBody = await readAll(req.raw);
      const body = JSON.parse(dec.decode(rawBody));
      const query = body.query;

      // if there were no errors, return the body and let the query run
      const error = guarDenoQL(schema, query, {
        depthLimitOptions: {
          maxDepth: 4,
        },
        costLimitOptions: {
          maxCost: 20,
          mutationCost: 5,
          objectCost: 2,
          scalarCost: 1,
          depthCostFactor: 2,
        },
      });

      if (error !== undefined) {
        return body;
      } else {
        const errorMessage = { error };
        // send the error to the client
        return res.send(JSON.stringify(errorMessage));
      }
    };

    const resp = await GraphQLHTTP<Request>({
      schema,
      context: (request) => ({ request }),
      graphiql: true,
    })(request);

    for (const [k, v] of resp.headers.entries()) res.headers?.append(k, v);

    res.status = resp.status;

    res.send(await resp.text());
  })
  .listen(3000, () => console.log(`☁  Started on http://localhost:3000`));
