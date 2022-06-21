define(function() {
    // load the prediction model 
    const model = await loadLayersModel('https://github.com/mazarinno/lolapp2/blob/main/utils/tfjsmodel/model.json');
    
    function get(callback) {
        return makePrediction(callback);
    }
    
    function makePrediction(callback) {
        const inputMax = callback.max();
        const inputMin = callback.min();

        const normalizedInputs = inputTensor.sub(inputMin).div(inputMax.sub(inputMin));

        let prediction = model.predict(normalizedInputs);

        return prediction;
    }

    return {
        get: get
    }
});