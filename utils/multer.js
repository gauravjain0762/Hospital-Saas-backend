import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "./cloudinary.js";

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isPDF = file.mimetype === "application/pdf";

    return {
      folder: "hospital-saas",

      // ✅ Correct resource type handling
      resource_type: isPDF ? "raw" : "image",

      // ✅ VERY IMPORTANT (fixes blocked delivery)
      type: "upload",

      access_mode: "public",

      // ✅ Allowed formats
      format: isPDF ? "pdf" : undefined,
    };
  },
});

const upload = multer({
  storage,
  limits: { files: 7 }, // max 7 files
});

export default upload;