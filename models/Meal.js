    const mongoose = require('mongoose');
    const Schema = mongoose.Schema;
    
    const MealSchema = new Schema({
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
      calories: {
        type: Number,
        required: true,
      },
      date: {
        type: Date,
        default: Date.now,
      },
    });
    
    module.exports = mongoose.model('Meal', MealSchema);
    
