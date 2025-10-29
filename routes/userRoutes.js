require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); 
const csv = require('csv-parser');
const { Readable } = require('stream');
const auth = require('../middleware/auth.js');
const User = require('../models/User.js');
const Meal = require('../models/Meal.js');
const Workout = require('../models/Workout.js');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// --- REMOVED UNUSED MULTER CONFIG ---
// const storage = multer.memoryStorage();
// const upload = multer({ storage: storage });

// ... (all other routes like /register, /login, /profile, etc. remain the same) ...
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ msg: 'Please enter all fields' });
    }
    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }
        user = new User({ name, email, password });
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });
        const mailOptions = {
            to: user.email,
            from: process.env.EMAIL_USER,
            subject: 'Welcome to FitTrack!',
            text: `Hi ${name},\n\nWelcome to FitTrack! We're excited to have you on board to start your fitness journey.\n\nLog your meals and workouts to get started.\n\nBest,\nThe FitTrack Team`,
        };
        await transporter.sendMail(mailOptions);
        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;
            res.status(201).json({ token });
        });
    } catch (err) {
        console.error('Registration Error:', err.message);
        res.status(500).send('Server Error');
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }
        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;
            res.json({ token });
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.put('/profile', auth, async (req, res) => {
    const { name, weight, height, goal, age, gender, activityLevel } = req.body;
    const profileFields = { name, weight, height, goal, age, gender, activityLevel };
    try {
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: profileFields },
            { new: true }
        ).select('-password');
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }
        res.json(user);
    } catch (err) {
        console.error('Profile update error:', err.message);
        res.status(500).send('Server Error');
    }
});

router.post('/upload-avatar', auth, async (req, res) => {
    try {
        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({ msg: 'No file was uploaded.' });
        }
        const avatarFile = req.files.avatar;
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found.' });
        }
        const uploadDir = path.join(__dirname, '../uploads/avatars');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        const fileExtension = path.extname(avatarFile.name);
        const fileName = `${user._id}${Date.now()}${fileExtension}`;
        const uploadPath = path.join(uploadDir, fileName);
        if (user.avatar) {
            const oldAvatarPath = path.join(__dirname, '..', user.avatar);
            if (fs.existsSync(oldAvatarPath)) {
                fs.unlinkSync(oldAvatarPath);
            }
        }
        await avatarFile.mv(uploadPath, async (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Server error during file upload.');
            }
            const avatarUrl = `/uploads/avatars/${fileName}`;
            user.avatar = avatarUrl;
            await user.save();
            res.json({ msg: 'Avatar uploaded successfully', avatar: avatarUrl });
        });
    } catch (err) {
        console.error('Error uploading avatar:', err.message);
        res.status(500).send('Server Error');
    }
});

router.delete('/avatar', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found.' });
        }
        if (user.avatar) {
            const avatarPath = path.join(__dirname, '..', user.avatar);
            if (fs.existsSync(avatarPath)) {
                fs.unlink(avatarPath, (err) => {
                    if (err) console.error("Error deleting avatar file:", err);
                });
            }
        }
        user.avatar = null;
        await user.save();
        res.json({ msg: 'Avatar removed successfully.' });
    } catch (err) {
        console.error('Error removing avatar:', err.message);
        res.status(500).send('Server Error');
    }
});

router.put('/change-password', auth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    try {
        const user = await User.findById(req.user.id);
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Incorrect current password' });
        }
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();
        res.json({ msg: 'Password updated successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.delete('/delete-account', auth, async (req, res) => {
    try {
        await Meal.deleteMany({ user: req.user.id });
        await Workout.deleteMany({ user: req.user.id });
        await User.findByIdAndDelete(req.user.id);
        res.json({ msg: 'User account deleted' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.get('/export-data', auth, async (req, res) => {
    try {
        const meals = await Meal.find({ user: req.user.id }).sort({ date: 'asc' });
        const workouts = await Workout.find({ user: req.user.id }).sort({ date: 'asc' });
        let csv = 'Type,Name,Date,Calories,Duration,Calories Burned\n';
        meals.forEach(item => { csv += `Meal,"${item.name}","${item.date.toISOString()}",${item.calories},,\n`; });
        workouts.forEach(item => { csv += `Workout,"${item.name}","${item.date.toISOString()}",,"${item.duration}",${item.caloriesBurned || ''}\n`; });
        res.header('Content-Type', 'text/csv');
        res.attachment('FitTrack_Export.csv');
        res.send(csv);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.post('/email-data', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }
        const meals = await Meal.find({ user: req.user.id }).sort({ date: 'asc' });
        const workouts = await Workout.find({ user: req.user.id }).sort({ date: 'asc' });
        let csv = 'Type,Name,Date,Calories,Duration,Calories Burned\n';
        meals.forEach(item => { csv += `Meal,"${item.name}","${item.date.toISOString()}",${item.calories},,\n`; });
        workouts.forEach(item => { csv += `Workout,"${item.name}","${item.date.toISOString()}",,"${item.duration}",${item.caloriesBurned || ''}\n`; });
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });
        const mailOptions = {
            to: user.email,
            from: process.env.EMAIL_USER,
            subject: 'Your FitTrack Data Export',
            text: `Hello ${user.name},\n\nAs requested, we've attached a CSV file containing all of your logged meals and workouts from your FitTrack account.\n\nThis file, 'FitTrack_Export.csv', can be opened with any spreadsheet software like Microsoft Excel, Google Sheets, or Apple Numbers.\n\nIf you did not request this data export, please disregard this email.\n\nThank you for using FitTrack!\n\nSincerely,\nThe FitTrack Team`,
            attachments: [{ filename: 'FitTrack_Export.csv', content: csv, contentType: 'text/csv' }],
        };
        await transporter.sendMail(mailOptions);
        res.json({ msg: 'Data has been sent to your email.' });
    } catch (err) {
        console.error('Email data export error:', err.message);
        res.status(500).send('Server Error');
    }
});

router.put('/notifications', auth, async (req, res) => {
    const { weeklySummary, dailyReminder } = req.body;
    try {
        const user = await User.findById(req.user.id);
        if (!user) { return res.status(404).json({ msg: 'User not found' }); }
        user.set({
            notificationPreferences: {
                weeklySummary: weeklySummary,
                dailyReminder: dailyReminder,
            },
        });
        await user.save();
        res.json(user.notificationPreferences);
    } catch (err) {
        console.error('Notification update error:', err.message);
        res.status(500).send('Server Error');
    }
});

router.delete('/reset-data', auth, async (req, res) => {
    try {
        await Meal.deleteMany({ user: req.user.id });
        await Workout.deleteMany({ user: req.user.id });
        res.json({ msg: 'All personal data has been reset.' });
    } catch (err) {
        console.error('Data reset error:', err.message);
        res.status(500).send('Server Error');
    }
});

// --- THIS ROUTE IS NOW FIXED TO USE express-fileupload ---
router.post('/import-data', auth, (req, res) => {
    // The express-fileupload middleware makes files available on req.files
    if (!req.files || Object.keys(req.files).length === 0 || !req.files.file) {
        return res.status(400).json({ msg: 'No file was uploaded.' });
    }
    
    const results = [];
    // The uploaded file buffer is on req.files.file.data
    const stream = Readable.from(req.files.file.data.toString('utf8'));

    stream.pipe(csv())
        .on('data', (data) => results.push(data))
        .on('error', (error) => {
            console.error('CSV parsing error:', error.message);
            return res.status(400).json({ msg: 'Failed to parse CSV file. Please check the format.' });
        })
        .on('end', async () => {
            try {
                const mealsToInsert = [];
                const workoutsToInsert = [];

                for (const row of results) {
                    const date = row.Date && !isNaN(new Date(row.Date)) ? new Date(row.Date) : new Date();
                    if (row.Type === 'Meal' && row.Name && row.Calories && !isNaN(parseInt(row.Calories))) {
                        mealsToInsert.push({ user: req.user.id, name: row.Name, calories: parseInt(row.Calories), date });
                    } else if (row.Type === 'Workout' && row.Name && row.Duration) {
                        const caloriesBurned = row['Calories Burned'] && !isNaN(parseInt(row['Calories Burned'])) ? parseInt(row['Calories Burned']) : null;
                        workoutsToInsert.push({ user: req.user.id, name: row.Name, duration: row.Duration, caloriesBurned, date });
                    }
                }
                
                if (mealsToInsert.length > 0) {
                    await Meal.insertMany(mealsToInsert);
                }
                if (workoutsToInsert.length > 0) {
                    await Workout.insertMany(workoutsToInsert);
                }

                return res.json({ msg: `${results.length} rows processed. Data imported successfully!` });
            } catch (err) {
                console.error('Error during data import processing:', err.message);
                return res.status(500).send('Server Error during import.');
            }
        });
});

// ... (remaining routes like /forgot-password, /goals, etc. are unchanged) ...
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.json({ msg: 'If an account with that email exists, a password reset link has been sent.' });
        }
        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000;
        await user.save();
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });
        const mailOptions = {
            to: user.email,
            from: process.env.EMAIL_USER,
            subject: 'FitTrack Password Reset',
            text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n
Please click on the following link, or paste this into your browser to complete the process:\n\n
http://localhost:3000/reset-password/${token}\n\n
If you did not request this, please ignore this email and your password will remain unchanged.\n`,
        };
        await transporter.sendMail(mailOptions);
        res.json({ msg: 'Password reset email sent successfully.' });
    } catch (err) {
        console.error('FORGOT PASSWORD ERROR:', err.message);
        res.status(500).send('Server Error');
    }
});

router.post('/reset-password/:token', async (req, res) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() },
        });
        if (!user) {
            return res.status(400).json({ msg: 'Password reset token is invalid or has expired.' });
        }
        const { password } = req.body;
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();
        res.json({ msg: 'Password has been updated successfully.' });
    } catch (err) {
        console.error('RESET PASSWORD ERROR:', err.message);
        res.status(500).send('Server Error');
    }
});

router.get('/common-activities', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const commonMeals = await Meal.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: { name: "$name", calories: "$calories" }, count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 3 },
            { $project: { _id: 0, name: "$_id.name", calories: "$_id.calories" } }
        ]);
        const commonWorkouts = await Workout.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: { name: "$name", duration: "$duration", caloriesBurned: "$caloriesBurned" }, count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 3 },
            { $project: { _id: 0, name: "$_id.name", duration: "$_id.duration", caloriesBurned: "$_id.caloriesBurned" } }
        ]);
        res.json({ commonMeals, commonWorkouts });
    } catch (err) {
        console.error("Error fetching common activities:", err);
        res.status(500).send('Server Error');
    }
});

router.put('/goals', auth, async (req, res) => {
    const { goalType, targetWeight, startingWeight } = req.body;
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }
        const updateData = {
            goalType,
            targetWeight
        };
        if (typeof startingWeight === 'number' && (user.startingWeight === null || user.startingWeight === undefined)) {
            updateData.startingWeight = startingWeight;
        }
        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            { $set: updateData },
            { new: true }
        ).select('-password');
        res.json(updatedUser);
    } catch (err) {
        console.error("Error updating goals:", err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;