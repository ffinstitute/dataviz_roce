/**
 * The below functions are created based on Microsoft Excel implementations
 */


module.exports = {
    covariance: function (array1, array2) {
        if (array1.length !== array2.length) return false;
        else var n = array1.length;
        var mean1 = this.arrayMean(array1),
            mean2 = this.arrayMean(array2);
        var covariance = 0;
        for (i = 0; i < n; i++) {
            covariance += (array1[i] - mean1) * (array2[i] - mean2) / n;
        }
        return covariance;
    }, // equivalence of COV() in Excel

    variance: function (array) {
        var mean = this.arrayMean(array);
        return this.arraySum(
                array.map(function (num) {
                    return Math.pow(num - mean, 2);
                })
            ) / (array.length - 1);
    }, // equivalence of VAR() in Excel

    correlation: function (array1, array2) {
        if (array1.length !== array2.length) return false;
        else var n = array1.length;

        var mean1 = this.arrayMean(array1),
            mean2 = this.arrayMean(array2);

        var part1 = 0,
            part2a = 0,
            part2b = 0;

        for (i = 0; i < n; i++) {
            var x1 = array1[i],
                x2 = array2[i];

            part1 += (x1 - mean1) * (x2 - mean2);
            part2a += Math.pow(x1 - mean1, 2);
            part2b += Math.pow(x2 - mean2, 2);
        }

        return part1 / Math.sqrt(part2a * part2b);
    }, // equivalence of CORREL() in Excel

    arrayMean: function (array) {
        return this.arraySum(array) / array.length;
    },

    arraySum: function (array) {
        var num = 0;
        for (var i = 0, l = array.length; i < l; i++) num += array[i];
        return num;
    }
};
