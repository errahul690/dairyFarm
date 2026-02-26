function notFoundHandler(_req, res) {
  res.status(404).json({ error: "Not Found" });
}

function errorHandler(err, _req, res, _next) {
  const message = err instanceof Error ? err.message : "Internal Server Error";
  res.status(500).json({ error: message });
}

module.exports = { notFoundHandler, errorHandler };

