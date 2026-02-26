const { Router } = require("express");
const { router: authRouter } = require("./auth");
const { router: animalsRouter } = require("./animals");
const { router: milkRouter } = require("./milk");
const { router: charaRouter } = require("./chara");
const { router: reportsRouter } = require("./reports");
const { router: usersRouter } = require("./users");
const { router: buyersRouter } = require("./buyers");
const { router: sellersRouter } = require("./sellers");
const { router: whatsappRouter } = require("./whatsapp");
const { router: paymentsRouter } = require("./payments");
const { router: notificationsRouter } = require("./notifications");
const { router: deliveryOverrideRouter } = require("./deliveryOverride");
const { router: settingsRouter } = require("./settings");

const appRouter = Router();

appRouter.use("/auth", authRouter);
appRouter.use("/animals", animalsRouter);
appRouter.use("/milk", milkRouter);
appRouter.use("/chara", charaRouter);
appRouter.use("/reports", reportsRouter);
appRouter.use("/users", usersRouter);
appRouter.use("/buyers", buyersRouter);
appRouter.use("/sellers", sellersRouter);
appRouter.use("/whatsapp", whatsappRouter);
appRouter.use("/payments", paymentsRouter);
appRouter.use("/notifications", notificationsRouter);
appRouter.use("/delivery-overrides", deliveryOverrideRouter);
appRouter.use("/settings", settingsRouter);

function registerRoutes(app) {
  app.use(appRouter);
  app.use("/api", appRouter);
}

module.exports = { registerRoutes };

