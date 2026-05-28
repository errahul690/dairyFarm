const { Router } = require("express");
const multer = require("multer");
const path = require("path");
const { requireAuth, requireAdminOrSuperAdmin } = require("../middleware/auth");
const { getApkUploadDir } = require("../models/appRelease");
const {
  checkUpdate,
  downloadLatest,
  listReleasesController,
  uploadRelease,
} = require("../controllers/appRelease.controller");

const router = Router();

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, getApkUploadDir());
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || "") || ".apk";
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const name = (file.originalname || "").toLowerCase();
    const ok =
      file.mimetype === "application/vnd.android.package-archive" ||
      name.endsWith(".apk");
    if (!ok) {
      return cb(new Error("Only .apk files are allowed"));
    }
    cb(null, true);
  },
});

router.get("/check", checkUpdate);
router.get("/download/latest", downloadLatest);

router.get("/", requireAuth, requireAdminOrSuperAdmin, listReleasesController);
router.post(
  "/",
  requireAuth,
  requireAdminOrSuperAdmin,
  (req, res, next) => {
    upload.single("apk")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || "Upload failed" });
      }
      next();
    });
  },
  uploadRelease
);

module.exports = { router };
