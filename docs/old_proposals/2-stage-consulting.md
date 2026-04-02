The current implementation a major issue in that it is asking for structured output and models are famously loathe to do that. The solution is to remove all the constraints on the experts, they will reply with prose, then a dedicated formatter will come in and arrange everything into proper json using the response_format feature:

response_format: {
  "type": "json_schema",
  "json_schema": { ... }
}

Which is available in gpt-4o-mini which we will use. 

Research has shown that this improves reasoning as models are not forced to spend time thinking about formatting so this change has quality benefits too. 

So the structure may be a bit more complicated; with this dedicated formatter sitting in between the experts and the lead, and perhaps the lead and the user (?)

I am told zod could be useful here we are already using it, so thats great. 

