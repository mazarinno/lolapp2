define('/utils/PredictionModel.js', [], function() {
    function get(data) {
        const model = await loadLayersModel('https://github.com/mazarinno/lolapp2/blob/main/utils/tfjsmodel/model.json');

        const inputMax = data.max();
        const inputMin = data.min();
    
        const normalizedInputs = inputTensor.sub(inputMin).div(inputMax.sub(inputMin));
    
        let prediction = model.predict(normalizedInputs);
        
        return prediction;
    }

    return {
        get: get
    };
});