import "dotenv/config";
import express from "express";
import cors from "cors";

import { authRouter } from "./routes/auth";
import { calendarRouter } from "./routes/calendar";

const app = express();
app.use(
  cors({ origin: process.env.APP_URL?.split(",") || "*", credentials: true })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/calendar", calendarRouter);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Calendar backend listening on http://localhost:${port}`);
});
