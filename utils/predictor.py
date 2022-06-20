import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import scale
from sklearn.model_selection import train_test_split
import pickle

url = 'https://raw.githubusercontent.com/mazarinno/blog/main/high_diamond_ranked_10min.csv'
df = pd.read_csv(url)

dfClean = df.copy()

# Removing unnecessary variables including game IDs, red team stats (since we are examining blue wins),
# first blood, etc.
cols = ['gameId', 'blueFirstBlood', 'redFirstBlood', 'redKills', 'redEliteMonsters', 'redDragons','redTotalMinionsKilled',
       'redTotalJungleMinionsKilled', 'redGoldDiff', 'redExperienceDiff', 'redCSPerMin', 'redGoldPerMin', 'redHeralds',
       'blueGoldDiff', 'blueExperienceDiff', 'blueCSPerMin', 'blueGoldPerMin', 'blueTotalMinionsKilled', 'blueAvgLevel',
        'redAvgLevel', 'redWardsPlaced', 'redWardsDestroyed', 'redDeaths', 'redAssists', 'redTowersDestroyed',
       'redTotalExperience', 'redTotalGold']
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

# Initialize the three models 
clf_A = LogisticRegression(random_state = 42)

clf_A.fit(X_train, y_train)

filename = "model.sav"
pickle.dump(clf_A, open(filename, 'wb'))