window.$ = window.jQuery = require('jquery');

require("bootstrap");
require('bootstrap-select');

var d3 = require("d3");
var math_func = require('./math_func.js');

// console.log(math_func);

// dev env #TODO: remove these lines
window.d3 = d3;
window.math_func = math_func;

$(document).ready(function () {
    var $loading_overlay = $("div.loading"),
        diagram_data = [],
        $graph_div = $("#graphDiv"),
        exchange_list = [],
        market_cap_list = [],
        region_list = {},
        sector_list = [],
        industry_list = {},
        beta, correlation, company_data, company_exchange, graph_div_width, config;


    // listeners
    $("#test-update").click(test_plot);

    $(window).resize(function () {
        var new_graph_div_width = $graph_div.width();
        if (new_graph_div_width !== graph_div_width) {
            plotDiagram(diagram_data);
            graph_div_width = new_graph_div_width;
        }
    });


    // load data
    d3.csv('company_data.csv', function (error, data) {
        if (error) {
            company_data = false;
            console.error(error);
        } else {
            company_data = data;
        }
    });

    d3.csv('company_exchange.csv', function (error, data) {
        if (error) {
            company_exchange = false;
            console.error(error);
        } else {
            company_exchange = data;
        }
    });

    $.get("config.json", function (data) {
        config = data;
        market_cap_list = config['market_caps'];
        region_list = config['regions'];
    }).fail(function (error) {
        config = false;
        console.error(error);
    });

    initOptions();

    // functions


    function initOptions() {
        // Is data ready?
        if (company_data && company_exchange && config) {
            console.info("Initiating");

            // prepare company_data by inserting exchange value
            company_data = $.map(company_data, function (datum1) {
                // console.log(datum);

                // find exchange
                company_exchange = $.grep(company_exchange, function (datum2) {
                    if (datum1['Symbol'] === datum2['symbol']) {
                        var exchange = datum2['exchange'];

                        if (exchange_list.indexOf(exchange) === -1) exchange_list.push(exchange);
                        datum1['Exchange'] = exchange;
                        return false;
                    } else {
                        return true;
                    }
                });

                // fill sector_list, industry_list

                var sector = datum1['Sector'],
                    industry = datum1['Industry'];
                if (sector_list.indexOf(sector) === -1) sector_list.push(sector);
                industry_list[industry] = sector;
                return datum1;
            });


            // init exchange options
            $.each(exchange_list, function (i, exchange) {
                // console.log(exchange);
                $(".exchange").append(generateOptionElement(exchange, exchange));
            });

            // init market cap options
            $.each(market_cap_list, function (cap_level_name, range) {
                $(".cap").append(generateOptionElement(cap_level_name, range));
            });

            // init region options
            $.each(region_list, function (region_name, countries) {
                $(".region").append(generateOptionElement(region_name, countries));
            });

            // init sector options
            $.each(sector_list, function (i, sector_name) {
                $(".sector").append(generateOptionElement(sector_name, sector_name));
            });

            // init industry options
            $.each(industry_list, function (industry_name, sector_name) {
                $(".industry select").append(
                    '<option value="' + industry_name + '" data-tokens="' + sector_name + '">' + industry_name + '</option>'
                );
            });

            $('.industry .selectpicker').selectpicker('refresh').selectpicker('deselectAll');

            // add listeners
            $("span.option").click(function () {
                $(this).toggleClass("selected");
            });
        } else if (company_data === false || company_exchange === false || config === false) {
            // deal with load error
            alert("Something went wrong. See console log for details.");
        } else {
            return setTimeout(initOptions, 100);
        }
    }

    function generateOptionElement(text, value) {
        return $("<span class='option'></span>").text(text).data('value', value);
    }


    function calculateVariations(retry_count) {
    }


    function showLoading(to_show) {
        var is_hidden_now = $loading_overlay.is(":hidden");

        if (to_show && is_hidden_now) {
            $loading_overlay.show();
        } else if (!to_show && !is_hidden_now) {
            $loading_overlay.hide();
        }
    }


    /**********************
     * Math Calculation
     */


    /****** Initiate ******/
    var outer_width, width, x, y,
        outer_height = 400,
        margin = {top: 20, right: 20, bottom: 30, left: 50},
        height = outer_height - margin.top - margin.bottom,
        dot_radius = 4; //pixels


    // append svg
    var svg = d3.select("#graphDiv svg"),
        g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var colorScale = d3.scaleOrdinal(d3.schemeCategory20);

    // Add Axis
    g.append("g").attr("class", "grid x-grid");
    g.append("g").attr("class", "grid y-grid");
    g.append("g").attr("class", "axis x-axis").attr("transform", "translate(0," + height + ")");
    g.append("g").attr("class", "axis y-axis");

    /**** Initiated ****/
    function test_plot() {
        diagram_data = [];
        var count_per_category = Math.round(Math.random() * 3 + 3);
        for (var ii = 0; ii < Math.random() * 5 + 7; ii++) {
            for (var jj = 0; jj < count_per_category; jj++) {
                diagram_data.push({tr: Math.random() * 10, mg: Math.random() * 10, category_index: ii});
            }
        }
        plotDiagram();
    }

    function plotDiagram() {
        if (!diagram_data) {
            return false;
        }
        console.info(Date.now() % 100000, "Ploting data");
        var outer_div_width = $graph_div.width();
        outer_width = Math.min(Math.max(outer_div_width, 500), 700);

        width = outer_width - margin.left - margin.right;
        x = d3.scaleLinear().range([0, width]);
        y = d3.scaleLinear().range([height, 0]);

        // console.log(data);
        // g.selectAll("circle").remove();

        // update svg
        svg.attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .style("margin-left", ($("div.container").width() - outer_width) / 2);

        x.domain([0, d3.max(diagram_data, function (d) {
            return d['tr'];
        })]);
        y.domain([0, d3.max(diagram_data, function (d) {
            return d['mg'];
        })]);

        var t = d3.transition()
            .duration(350);

        // update grid lines
        g.select(".x-grid")
            .transition(t)
            .attr("transform", "translate(0," + height + ")")
            .call(d3.axisBottom(x).ticks().tickSize(-height).tickFormat(""));

        g.select(".y-grid")
            .transition(t)
            .call(d3.axisLeft(y).ticks().tickSize(-width).tickFormat(""));

        // Update the scatterplot
        var dots = g.selectAll("circle").data(diagram_data);

        dots.exit()
            .classed("exit", true)
            .transition(t)
            .attr("r", dot_radius * 5)
            .style("fill-opacity", 1e-6)
            .remove();

        dots.classed("update", true)
            .attr("fill", function (d) {
                return colorScale(d['category_index']);
            });

        dots.enter().append("circle")
            .attr("r", dot_radius)
            .attr("class", "dot")
            .merge(dots)
            .on("mouseover", function (d) {
                var $tooltip = $("#tooltip");
                var tooltip_left = parseFloat(d3.select(this).attr("cx")) + $graph_div.position()['left']
                    + $tooltip.width() / 2 + 72 + parseFloat($graph_div.find("svg").css("margin-left"));
                var tooltip_top = parseFloat(d3.select(this).attr("cy")) + $graph_div.position()['top']
                    - $tooltip.height() / 2 - 73;

                if (tooltip_left > width - 100) {
                    // might exceed right side of screen, switch to left
                    tooltip_left -= 179;
                }

                // handle dot
                d3.select(this).attr("r", dot_radius * 2.5).classed("hover", true);

                // handle tooltip
                var tooltip = d3.select("#tooltip")
                    .style("left", tooltip_left + "px")
                    .style("top", tooltip_top + "px")
                    .classed("hidden", false);

            })
            .on("mouseout", function () {
                // handle dot
                d3.select(this).attr("r", dot_radius).classed("hover", false);

                // hide tooltip
                d3.select("#tooltip").classed("hidden", true);
            })
            .transition(t)
            .attr("cx", function (d) {
                return x(d['tr']);
            })
            .attr("cy", function (d) {
                return y(d['mg']);
            })
            .attr("fill", function (d) {
                return colorScale(d['category_index']);
            });

        // Update Axis
        g.select(".x-axis")
            .transition(t)
            .call(d3.axisBottom(x));

        g.select(".y-axis")
            .transition(t)
            .call(d3.axisLeft(y));
    }
});
