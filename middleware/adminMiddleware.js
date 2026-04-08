import User from "../models/User.js";

export const isAdmin = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);

        //manual admin check
        if (user.email !== "admin@saas.com") {
            return res.status(403).json({
                message: "Access denied. Admins only.",
            });
        }

        next();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};