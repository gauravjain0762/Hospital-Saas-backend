import transporter from "../config/email.js";

export const sendApprovalEmail = async (to) => {
    await transporter.sendMail({
        from: `"Hospital Management System" <${process.env.EMAIL_USER}>`,
        to,
        subject: "Account Approved",
        html: `
            <h1>Congratulations!</h1>
            <p>Your account has been approved. You can now log in and start using our services.</p>
        `,
    });
}

export const sendRejectionEmail = async (to, reason) => {
    await transporter.sendMail({
        from: `"Hospital Management System" <${process.env.EMAIL_USER}>`,
        to,
        subject: "Account Rejected",
        html: `
            <h2>Your account has been rejected</h2>
            <p><strong>Reason:</strong> ${reason}</p>
            <p>Please re-register with correct details. If you have any questions, please contact support.</p>
        `,
    });
};
