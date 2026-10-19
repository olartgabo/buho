#!/usr/bin/env node
import "./env.js";
import { startHttpServer } from "@buho/virtual/http";
import { buildServer } from "./build.js";

startHttpServer(buildServer, "buho-help");
