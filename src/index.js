import Fastify from "fastify"
import orySdk from "@ory/client"
import gql from "graphql-tag"
import { GraphQLError } from "graphql"
import { ApolloServer } from "@apollo/server"
import { fastifyApolloHandler } from "@as-integrations/fastify"
import {
  ApolloServerPluginLandingPageLocalDefault,
  ApolloServerPluginLandingPageProductionDefault,
} from "@apollo/server/plugin/landingPage/default"
import { APP_ENV, ENVIRONMENTS, ORY_BASE_PATH } from "./config.js"

const fastify = Fastify({
  logger: true,
})

const ory = new orySdk.FrontendApi(
  new orySdk.Configuration({
    basePath: ORY_BASE_PATH,
  })
)

const apollo = new ApolloServer({
  typeDefs: gql`
    type Query {
      welcome: String
    }
  `,
  resolvers: {
    Query: {
      welcome: (_, __, { identity }) => identity.traits.email,
    },
  },
  plugins: [
    ...(APP_ENV === ENVIRONMENTS.PROD
      ? [ApolloServerPluginLandingPageProductionDefault()]
      : [ApolloServerPluginLandingPageLocalDefault({ includeCookies: true })]),
  ],
})

await apollo.start()

const apolloContext = async (request) => {
  const { cookie } = request?.headers

  if (!cookie) {
    throw new GraphQLError("Unauthorized", {
      extensions: {
        code: "UNAUTHORIZED",
        http: {
          status: 401,
        },
      },
    })
  }

  const orySession = await ory.toSession({ cookie })

  return { identity: orySession.data.identity }
}

fastify.get("/", function (req, res) {
  return res.send("API alive")
})

fastify.get("/auth", async function (req, res) {
  try {
    const { data: session } = await ory.toSession({
      cookie: req.headers["cookie"],
    })
    res.send(session.identity)
  } catch (error) {
    res.redirect("/.ory/ui/login")
  }
})

fastify.route({
  url: "/graphql",
  method: ["GET", "POST", "OPTIONS"],
  handler: fastifyApolloHandler(apollo, { context: apolloContext }),
})

fastify.listen({ port: 8080 }, (err, address) => {
  if (err) throw err
})
