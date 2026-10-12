import { createServer as createViteServer } from "vite";
import express from "express";
import path from "path";
import { app } from "./api";
const PORT = process.env.PORT || 3e3;
async function startServer() {
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.resolve(__dirname, "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  app.listen(PORT, () => {
    console.log(`NetXpert server listening on port ${PORT}`);
  });
}
startServer();
