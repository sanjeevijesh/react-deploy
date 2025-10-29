require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const fileUpload = require('express-fileupload'); // Import express-fileupload

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// --- THIS LINE IS THE FIX ---
app.use(fileUpload()); // Use fileUpload middleware for all file uploads

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Define API Routes
app.use('/api/users', require('./routes/userRoutes.js'));
app.use('/api/meals', require('./routes/mealRoutes.js'));
app.use('/api/workouts', require('./routes/workoutRoutes.js'));
app.use('/api/analytics', require('./routes/analyticsRoutes.js'));
app.use('/api/ai', require('./routes/aiRoutes.js'));
app.use('/api/history', require('./routes/historyRoutes.js'));
app.use('/api/friends', require('./routes/friendsRoutes.js'));
app.use('/api/records', require('./routes/recordRoutes.js'));

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected...');
        app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
    } catch (err) {
        console.error('Failed to connect to MongoDB', err);
        process.exit(1);
    }
};
startServer();