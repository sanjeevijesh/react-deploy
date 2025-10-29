const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    weight: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    goal: { type: String, default: 'Not set' },
    age: { type: Number },
    gender: { type: String },
    activityLevel: { type: String },
    goalType: { type: String, enum: ['Lose Weight', 'Maintain Weight', 'Gain Weight'], default: 'Maintain Weight' },
    targetWeight: { type: Number },
    startingWeight: { type: Number },
    avatar: { type: String, default: null },

    friends: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    friendRequestsSent: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    friendRequestsReceived: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    
    notificationPreferences: {
        weeklySummary: { type: Boolean, default: true },
        dailyReminder: { type: Boolean, default: false }
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);