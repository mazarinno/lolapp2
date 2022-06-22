import pandas as pd
from sklearn.preprocessing import scale
from sklearn.model_selection import train_test_split
from keras.models import Sequential
from keras.layers import Dense
from keras.layers import Dropout
from keras.wrappers.scikit_learn import KerasClassifier
from sklearn.model_selection import cross_val_score
import tensorflowjs as tfjs

url = 'https://raw.githubusercontent.com/mazarinno/blog/main/high_diamond_ranked_10min.csv'
df = pd.read_csv(url)

dfClean = df.copy()

# Removing unnecessary variables including game IDs, red team stats (since we are examining blue wins),
# first blood, etc.
cols = ['gameId', 'blueFirstBlood', 'redFirstBlood', 'redKills', 'redEliteMonsters', 'redDragons','redTotalMinionsKilled',
       'redTotalJungleMinionsKilled', 'redGoldDiff', 'redExperienceDiff', 'redCSPerMin', 'redGoldPerMin', 'redHeralds',
       'blueGoldDiff', 'blueExperienceDiff', 'blueCSPerMin', 'blueGoldPerMin', 'blueTotalMinionsKilled', 'blueAvgLevel',
        'redAvgLevel', 'redWardsPlaced', 'redWardsDestroyed', 'redDeaths', 'redAssists', 'redTowersDestroyed',
       'redTotalExperience', 'redTotalGold', "blueTotalJungleMinionsKilled", "blueWardsPlaced", "blueWardsDestroyed"]
dfClean = dfClean.drop(cols, axis = 1)

# Separating data into the target variable (blue wins) and features (other relevant variables)
features = dfClean.drop(['blueWins'], 1)
target = dfClean['blueWins']

#Center to the mean and component wise scale to unit variance
for col in features.columns:
    features[col] = scale(features[col])

# Shuffle and split the dataset into training and testing set.
X_train, X_test, y_train, y_test = train_test_split(features, target, 
                                                    test_size = 50,
                                                    random_state = 2,
                                                    stratify = target)

# Initialize the model
classifier = Sequential()

# Input layer
classifier.add(Dense(5, kernel_initializer = "uniform",activation = "relu", input_dim=9))

# Output layer
classifier.add(Dense(1, kernel_initializer = "uniform",activation = "sigmoid"))

classifier.compile(optimizer= "adam",loss = "binary_crossentropy",metrics = ["accuracy"])

classifier.fit(X_train, y_train, batch_size = 10, epochs = 1)

prediction = classifier.predict([0.935301, -0.046926, 1.071495, -0.879231, -0.753226, -0.481132, -0.210439, 0.460179, -0.740639])

prediction