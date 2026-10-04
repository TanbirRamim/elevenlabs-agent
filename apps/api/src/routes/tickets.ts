import { PublicTicket, type Ticket, TicketSet, TicketsResponse } from "@shadow/schema";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const TicketsQuery = z.object({ set: TicketSet });

export function registerTicketRoutes(app: FastifyInstance, tickets: readonly Ticket[]): void {
  app.get("/tickets", async (req, reply) => {
    const query = TicketsQuery.safeParse(req.query);
    if (!query.success) {
      return reply.code(400).send({ code: "invalid_set", message: "set=expert|new_hire|held_out" });
    }
    const pub = tickets
      .filter((t) => t.label?.set === query.data.set)
      // PublicTicket.parse strips the answer key; the response parse is belt and braces.
      .map((t) => PublicTicket.parse(t));
    return TicketsResponse.parse({ tickets: pub });
  });
}
