/**
 * Type definitions for Dairy Farm Management App
 * Note: In JavaScript, we use JSDoc comments for type documentation
 */

// User Types
/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string} [phone]
 * @property {string} [role]
 * @property {number} [milkFixedPrice] - Fixed price per liter for milk sales
 * @property {number} [dailyMilkQuantity] - Expected daily milk quantity in liters
 */

// Animal Types
/**
 * @typedef {Object} Animal
 * @property {string} id
 * @property {string} name
 * @property {string} type
 * @property {string} [breed]
 * @property {number} [age]
 * @property {Date} [purchaseDate]
 * @property {number} [purchasePrice]
 * @property {'active'|'sold'|'deceased'} status
 */

/**
 * @typedef {Object} AnimalMedia
 * @property {string} uri
 * @property {'image'|'video'} type
 * @property {string} [name]
 */

/**
 * @typedef {Object} AnimalTransaction
 * @property {string} [_id]
 * @property {string} [id] - For backward compatibility
 * @property {string} [animalId] - Optional - for standalone transactions (animal name/ID)
 * @property {string} [animalName] - Animal name
 * @property {string} [animalType] - cow, buffalo, goat, sheep, etc.
 * @property {string} [breed] - Animal breed
 * @property {string} [gender] - male, female
 * @property {'sale'|'purchase'} type
 * @property {Date} date
 * @property {number} price
 * @property {string} [buyer]
 * @property {string} [buyerPhone]
 * @property {string} [seller]
 * @property {string} [sellerPhone]
 * @property {string} [notes]
 * @property {string} [location]
 * @property {string} [temperament]
 * @property {string} [description]
 * @property {AnimalMedia[]} [images]
 * @property {AnimalMedia[]} [videos]
 */

// Milk Types
/**
 * @typedef {Object} MilkTransaction
 * @property {string} _id
 * @property {'sale'|'purchase'} type
 * @property {Date} date
 * @property {number} quantity - in liters
 * @property {number} pricePerLiter
 * @property {number} totalAmount
 * @property {string} [buyer]
 * @property {string} [buyerPhone]
 * @property {string} [seller]
 * @property {string} [sellerPhone]
 * @property {string} [notes]
 * @property {number} [fixedPrice] - Buyer's fixed price at the time of transaction (for reference)
 */

// Chara (Fodder) Types
/**
 * @typedef {Object} CharaPurchase
 * @property {string} id
 * @property {Date} date
 * @property {number} quantity - in kg
 * @property {number} pricePerKg
 * @property {number} totalAmount
 * @property {string} [supplier]
 * @property {string} [notes]
 */

/**
 * @typedef {Object} DailyCharaConsumption
 * @property {string} id
 * @property {Date} date
 * @property {number} quantity - in kg
 * @property {string} [animalId]
 * @property {string} [notes]
 */

// Profit/Loss Types
/**
 * @typedef {Object} ProfitLossReport
 * @property {string} period
 * @property {number} totalRevenue
 * @property {number} totalExpenses
 * @property {number} profit
 * @property {number} loss
 * @property {Object} details
 * @property {number} details.milkSales
 * @property {number} details.animalSales
 * @property {number} details.milkPurchases
 * @property {number} details.animalPurchases
 * @property {number} details.charaPurchases
 * @property {number} details.otherExpenses
 */

