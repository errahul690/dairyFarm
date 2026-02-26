const { z } = require("zod");
const { listCharaPurchases, createCharaPurchase, listCharaConsumptions, createCharaConsumption } = require("../models");

const purchaseSchema = z.object({
  date: z.string().datetime(),
  quantity: z.number().nonnegative(),
  pricePerKg: z.number().nonnegative(),
  totalAmount: z.number().nonnegative(),
  supplier: z.string().optional(),
  notes: z.string().optional()
});

const consumptionSchema = z.object({
  date: z.string().datetime(),
  quantity: z.number().nonnegative(),
  animalId: z.string().optional(),
  notes: z.string().optional()
});

const listCharaPurchasesHandler = async (_req, res) => {
  try {
    const purchases = await listCharaPurchases();
    return res.json(purchases);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch chara purchases" });
  }
};

const createCharaPurchaseHandler = async (req, res) => {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  
  try {
    const item = await createCharaPurchase(parsed.data);
    return res.status(201).json(item);
  } catch (error) {
    return res.status(500).json({ error: "Failed to create chara purchase" });
  }
};

const listCharaConsumptionsHandler = async (_req, res) => {
  try {
    const consumptions = await listCharaConsumptions();
    return res.json(consumptions);
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch chara consumptions" });
  }
};

const createCharaConsumptionHandler = async (req, res) => {
  const parsed = consumptionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  
  try {
    const item = await createCharaConsumption(parsed.data);
    return res.status(201).json(item);
  } catch (error) {
    return res.status(500).json({ error: "Failed to create chara consumption" });
  }
};

module.exports = {
  listCharaPurchases: listCharaPurchasesHandler,
  createCharaPurchase: createCharaPurchaseHandler,
  listCharaConsumptions: listCharaConsumptionsHandler,
  createCharaConsumption: createCharaConsumptionHandler,
};
