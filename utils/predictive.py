import pickle

loaded_model = pickle.load(open('model.sav', 'rb'))
# result = loaded_model.score(X_test, Y_test)
# print(result)