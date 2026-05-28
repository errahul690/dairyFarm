const path = require("path");
const fs = require("fs");
const {
  getApkUploadDir,
  getLatestActive,
  listReleases,
  createRelease,
  getReleaseById,
} = require("../models/appRelease");

function publicReleasePayload(release, req) {
  if (!release) return null;
  const base =
    process.env.PUBLIC_API_BASE_URL ||
    `${req.protocol}://${req.get("host")}`;
  const downloadPath = `/api/app-release/download/latest`;
  return {
    _id: release._id.toString(),
    platform: release.platform,
    versionCode: release.versionCode,
    versionName: release.versionName,
    releaseNotes: release.releaseNotes || "",
    forceUpdate: !!release.forceUpdate,
    fileSize: release.fileSize || 0,
    createdAt: release.createdAt,
    downloadUrl: `${base.replace(/\/$/, "")}${downloadPath}`,
  };
}

/**
 * GET /app-release/check?platform=android&versionCode=1
 * Public — no auth required.
 */
async function checkUpdate(req, res) {
  try {
    const platform = (req.query.platform || "android").trim();
    const installed = Number(req.query.versionCode);
    if (!Number.isFinite(installed) || installed < 0) {
      return res.status(400).json({ error: "versionCode query param required (number)" });
    }

    const latest = await getLatestActive(platform);
    if (!latest || latest.versionCode <= installed) {
      return res.json({ updateAvailable: false, installedVersionCode: installed });
    }

    return res.json({
      updateAvailable: true,
      installedVersionCode: installed,
      latest: publicReleasePayload(latest, req),
    });
  } catch (err) {
    console.error("[appRelease] checkUpdate:", err);
    return res.status(500).json({ error: "Failed to check for updates" });
  }
}

/**
 * GET /app-release/download/latest
 * Public — streams active APK.
 */
async function downloadLatest(req, res) {
  try {
    const latest = await getLatestActive("android");
    if (!latest) {
      return res.status(404).json({ error: "No APK release found" });
    }
    const filePath = path.join(getApkUploadDir(), latest.storedFileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "APK file missing on server" });
    }
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Disposition", `attachment; filename="${latest.fileName}"`);
    return res.sendFile(path.resolve(filePath));
  } catch (err) {
    console.error("[appRelease] downloadLatest:", err);
    return res.status(500).json({ error: "Failed to download APK" });
  }
}

/**
 * GET /app-release — admin list
 */
async function listReleasesController(req, res) {
  try {
    const list = await listReleases("android", 30);
    return res.json(
      list.map((r) => ({
        _id: r._id.toString(),
        versionCode: r.versionCode,
        versionName: r.versionName,
        releaseNotes: r.releaseNotes || "",
        forceUpdate: !!r.forceUpdate,
        isActive: !!r.isActive,
        fileSize: r.fileSize || 0,
        fileName: r.fileName,
        createdAt: r.createdAt,
      }))
    );
  } catch (err) {
    console.error("[appRelease] list:", err);
    return res.status(500).json({ error: "Failed to list releases" });
  }
}

/**
 * POST /app-release — multipart: apk file + versionCode, versionName, releaseNotes?, forceUpdate?
 */
async function uploadRelease(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "apk file required (field name: apk)" });
    }

    const versionCode = Number(req.body.versionCode);
    const versionName = String(req.body.versionName || "").trim();
    if (!Number.isFinite(versionCode) || versionCode < 1) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "versionCode required (integer >= 1)" });
    }
    if (!versionName) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "versionName required" });
    }

    const latest = await getLatestActive("android");
    if (latest && latest.versionCode >= versionCode) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({
        error: `versionCode must be greater than current release (${latest.versionCode})`,
      });
    }

    const forceUpdate =
      req.body.forceUpdate === true ||
      req.body.forceUpdate === "true" ||
      req.body.forceUpdate === "1";

    const doc = await createRelease({
      platform: "android",
      versionCode,
      versionName,
      fileName: req.file.originalname || `app-v${versionName}.apk`,
      storedFileName: req.file.filename,
      fileSize: req.file.size || 0,
      releaseNotes: String(req.body.releaseNotes || "").trim(),
      forceUpdate,
      isActive: true,
    });

    return res.status(201).json({
      message: "APK uploaded. Users on older versions will see update prompt on next app open.",
      release: {
        _id: doc._id.toString(),
        versionCode: doc.versionCode,
        versionName: doc.versionName,
        forceUpdate: doc.forceUpdate,
        isActive: doc.isActive,
      },
    });
  } catch (err) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error("[appRelease] upload:", err);
    return res.status(500).json({ error: "Failed to upload APK" });
  }
}

module.exports = {
  checkUpdate,
  downloadLatest,
  listReleasesController,
  uploadRelease,
};
