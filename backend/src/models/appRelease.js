const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

const AppReleaseSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: ["android"],
      default: "android",
    },
    versionCode: {
      type: Number,
      required: true,
      min: 1,
    },
    versionName: {
      type: String,
      required: true,
      trim: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    storedFileName: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    releaseNotes: {
      type: String,
      default: "",
      trim: true,
    },
    forceUpdate: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
    toJSON: {
      transform(_, ret) {
        ret._id = ret._id.toString();
        delete ret.storedFileName;
        return ret;
      },
    },
  }
);

AppReleaseSchema.index({ platform: 1, isActive: 1, versionCode: -1 });

const AppRelease = mongoose.model("AppRelease", AppReleaseSchema);

function getApkUploadDir() {
  const dir = process.env.APK_UPLOAD_DIR || path.join(__dirname, "..", "..", "uploads", "apk");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function getLatestActive(platform = "android") {
  return AppRelease.findOne({ platform, isActive: true }).sort({ versionCode: -1 }).lean();
}

async function listReleases(platform = "android", limit = 20) {
  return AppRelease.find({ platform }).sort({ versionCode: -1 }).limit(limit).lean();
}

async function deactivateAllActive(platform = "android") {
  await AppRelease.updateMany({ platform, isActive: true }, { isActive: false });
}

async function createRelease(data) {
  await deactivateAllActive(data.platform || "android");
  const doc = await AppRelease.create(data);
  return doc;
}

async function getReleaseById(id) {
  return AppRelease.findById(id).lean();
}

module.exports = {
  AppRelease,
  getApkUploadDir,
  getLatestActive,
  listReleases,
  createRelease,
  getReleaseById,
};
