window.$ = window.jQuery = require('jquery');

require("bootstrap");
require('bootstrap-select');

var d3 = require("d3"),
    d3_sale_chromatic = require("d3-scale-chromatic");

d3.tip = require("d3-tip");

// console.log(math_func);

// dev env #TODO: remove these lines
window.d3 = d3;

$(document).ready(function () {
    var $loading_overlay = $("div.loading"),
        $color_legend_select = $("#color-legend-select"),
        $year_select = $("#year-select"),
        $graph_div = $("#graphDiv"),
        diagram_data = [],
        exchange_list = [],
        year_list = [],
        market_cap_list = [],
        region_list = [],
        sector_list = [],
        industry_dict = {},
        company_data, ROCE_data, graph_div_width, config, color_scale;


    // listeners
    $(window).resize(function () {
        var new_graph_div_width = $graph_div.width();
        if (new_graph_div_width !== graph_div_width) {
            plotDiagram(diagram_data);
            graph_div_width = new_graph_div_width;
        }
    });


    // load data
    d3.json('backend?item=company_list', function (error, data) {
        if (error) {
            company_data = false;
            console.error(error);
        } else {
            company_data = data['companies'];
        }
    });

    d3.json('backend?item=ROCE_list', function (error, data) {
        if (error) {
            ROCE_data = false;
            console.error(error);
        } else {
            ROCE_data = $.map(data['ROCEs'], function (datum) {
                datum['Y'] = datum['Y'].toString();
                return datum;
            });
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
        if (company_data && ROCE_data && config) {
            console.info("Initiating");
            // console.log(ROCE_data);

            // prepare company_data by inserting exchange value
            company_data = $.grep($.map(company_data, function (datum1) {
                // console.log(datum);
                var sector = datum1['sector'],
                    industry = datum1['industry'],
                    exchange = datum1['exchange'];

                if (!sector || !industry || sector === "n/a" || industry === "n/a") return false;

                if (exchange_list.indexOf(exchange) === -1) exchange_list.push(exchange);

                // fill sector_list, industry_list
                if (sector_list.indexOf(sector) === -1) sector_list.push(sector);
                industry_dict[industry] = sector;
                return datum1;
            }), function (datum) {
                return datum !== false;
            });

            // init exchange options
            $.each(exchange_list, function (i, exchange) {
                // console.log(exchange);
                $(".exchange").append(generateOptionElement(exchange, exchange));
            });

            // init market cap options
            $.each(market_cap_list, function (i, datum) {
                $(".cap").append(generateOptionElement(datum['name'], datum['range']));
            });

            region_list.sort(function (a, b) {
                return a['name'].length - b['name'].length;
            });
            // init region options
            $.each(region_list, function (i, datum) {
                $(".region").append(generateOptionElement(datum['name'], datum['countries']));
            });

            sector_list.sort(function (a, b) {
                return a.length - b.length;
            });
            // init sector options
            $.each(sector_list, function (i, sector_name) {
                $(".sector").append(generateOptionElement(sector_name, sector_name));
            });

            // init industry options
            $.each(industry_dict, function (industry_name, sector_name) {
                var $option = $('<option value="' + industry_name + '">' + industry_name + '</option>')
                    .data({
                        'sector': sector_name,
                        'tokens': sector_name + " " + industry_name
                    });
                $(".industry select").append($option);
            });
            $('.industry .selectpicker').selectpicker('refresh');

            // init year
            updateYearOptions(true);

            // init color legend
            updateDiagramWrapper();

            /** add listeners **/
            // span click
            $("span.option").click(function () {
                $(this).toggleClass("selected");
                updateDiagramWrapper();
                updateClearAllButtons();
            });

            // legend select
            $color_legend_select.on('hidden.bs.select', function (e) {
                updateDiagramWrapper();
            });

            // year select
            $year_select.on('hidden.bs.select', function (e) {
                updateDiagramWrapper();
            });

            // clear all button
            $(".clear-button").click(function () {
                $(this).closest(".option-wrapper").find("span").removeClass("selected");
                updateDiagramWrapper();
                updateClearAllButtons();
            });

            // industry select
            $('div.industry.option-wrapper select').on("input change", function () {
                var sector_name = $(this).find("option:selected").data('sector');

                $(".sector.option-wrapper span").each(function () {
                    $(this).toggleClass("selected", $(this).data('value') === sector_name);
                }); // select sector according to industry
                updateDiagramWrapper();
                updateClearAllButtons();
            });


        } else if (company_data === false || ROCE_data === false || config === false) {
            // deal with load error
            alert("Something went wrong. See console log for details.");
        } else {
            return setTimeout(initOptions, 100);
        }
    }

    function updateClearAllButtons() {
        $(".option-wrapper").each(function () {
            var $wrapper = $(this);
            $wrapper.find(".clear-button").toggleClass("invisible", $wrapper.find('.option.selected').length === 0);
        });
    }

    function generateOptionElement(text, value) {
        return $("<span class='option'></span>").text(text).data('value', value)
            .prepend("<div class='color-legend-rect'></div>");
    }

    function updateDiagramWrapper() {
        updateColorLegend();
        updateDiagramData();
        plotDiagram();
    }

    function updateColorLegend() {
        var $wrapper;

        switch ($color_legend_select.val()) {
            case 'exchange':
                $wrapper = $(".exchange.option-wrapper");
                break;
            case 'sector':
                $wrapper = $(".sector.option-wrapper");
                break;
            case 'market_cap':
                $wrapper = $(".cap.option-wrapper");
                break;
            case 'region':
                $wrapper = $(".region.option-wrapper");
                break;
            default:
                return console.error("Unknown legend value") && false;
        }

        // manipulate class
        $(".option-wrapper").removeClass("on-legend");
        $wrapper.addClass("on-legend");

        // update color
        var $selected_options = $wrapper.find("span.option.selected");
        updateColorScale($selected_options.length);
        $selected_options.each(updateOptionLegendColor);
    }

    function updateDiagramData() {
        diagram_data = [];

        var options = getOptionsWrapper();
        var color_legend = $color_legend_select.val();
        var options_on_legend = options[color_legend];

        /** test block ***/
        // console.log("options", options);
        // console.log("legend", color_legend);
        // console.log("legend options", options[color_legend]);
        if (!options_on_legend) return false;
        /*** end of test block ***/

        var matched_companies = [];
        $.each(company_data, function () {
            // filter out by exchange
            var exchange_options = options['exchange'];
            if (exchange_options && exchange_options.indexOf(this['exchange']) < 0) {
                return;
            }

            // filter out by market cap
            var market_cap_options = options['market_cap'];
            if (market_cap_options) {
                var company_cap = this['market_cap'],
                    cap_matched_index = -1;
                $.each(market_cap_options, function (option_index) {
                    if ((this[0] && this[0] > company_cap) || (this[1] && this[1] <= company_cap)) {
                        return;
                    }
                    cap_matched_index = option_index;
                });
                if (cap_matched_index < 0) {
                    return;
                }
            }

            // filter out by sector
            var sector_options = options['sector'];
            if (sector_options && sector_options.indexOf(this['sector']) < 0) {
                return;
            }

            // filter out by region
            var region_options = options['region'];
            if (region_options) {
                // var country_list = [].concat.apply([], region_options);
                var region_matched_index = -1;
                var company_country = this['country'];
                $.each(region_options, function (region_index) {
                    if (this.indexOf(company_country) > -1) {
                        // matched
                        region_matched_index = region_index;
                        return false;
                    }
                });
                if (region_matched_index < 0) {
                    return;
                }
            }

            // filter out by industry
            var industry_options = options['industry'];
            if (industry_options && industry_options.indexOf(this['industry']) < 0) {
                return;
            }

            var color_index = -1;

            switch (color_legend) {
                case 'exchange':
                case 'sector':
                    color_index = options_on_legend.indexOf(this[color_legend]);
                    break;

                case 'market_cap':
                    color_index = cap_matched_index;
                    break;

                case 'region':
                    color_index = region_matched_index;
                    break;
            }

            /** Now we have valid companies **/
            matched_companies.push({
                'company_id': this['id'],
                'color_index': color_index
            });
        });

        // console.log(matched_companies);

        if (matched_companies.length === 0) return false;

        var selected_year = $year_select.val();
        year_list = []; // update year_list
        $.each(ROCE_data, function () {
            var ROCE_datum = this;
            var year = this['Y'];

            // console.log(ROCE_datum);

            // if (ROCE_datum['TR'] > 5 || ROCE_datum['TR'] < 0) return;
            // if (ROCE_datum['OM'] > 40 || ROCE_datum['OM'] < 0) return;
            /***test****/
            $.each(matched_companies, function () {
                // console.log("matched company", this);
                if (this['company_id'] === ROCE_datum['cId']) {
                    if (year_list.indexOf(year) === -1) {
                        year_list.push(year);
                    }

                    if (!selected_year || year === selected_year) {
                        diagram_data.push({
                            "TR": ROCE_datum['TR'],
                            "OM": ROCE_datum['OM'],
                            "category_index": this['color_index'],
                            "company_id": this['company_id']
                        });
                    }

                    return false;
                }
            });
        });

        updateYearOptions();
    }

    function updateColorScale(color_count) {
        if (color_count > 12) {
            color_scale = d3.scaleOrdinal(d3.schemeCategory20);
        } else if (color_count > 10) {
            color_scale = d3.scaleOrdinal(d3_sale_chromatic.schemePaired);
        } else {
            color_scale = d3.scaleOrdinal(d3.schemeCategory10);
        }
    }

    function updateYearOptions(do_init) {
        if (do_init) {
            $.each(ROCE_data, function () {
                // update year_list
                var year = this['Y'];
                if (year_list.indexOf(year) === -1) {
                    year_list.push(year);
                }
            });
        }
        year_list = year_list.sort().reverse();
        var selected_year = $year_select.val();
        $year_select.empty();
        $.each(year_list, function () {
            var $option = $('<option></option>').prop("value", this).text(this);
            $year_select.append($option);
        });
        if (year_list.indexOf(selected_year) > -1) {
            $year_select.val(selected_year);
            $year_select.selectpicker('refresh');
        } else {
            $year_select.val(year_list[0]);
            $year_select.selectpicker('refresh');
            updateDiagramWrapper();
        }
    }

    function updateOptionLegendColor(option_index) {
        var $this = $(this);
        var color = color_scale(option_index);
        $this.find(".color-legend-rect").css({background: color});
    }


    function showLoading(to_show) {
        var is_hidden_now = $loading_overlay.is(":hidden");

        if (to_show && is_hidden_now) {
            $loading_overlay.show();
        } else if (!to_show && !is_hidden_now) {
            $loading_overlay.hide();
        }
    }

    /*** Get Filters ***/
    function getFilterFromSpans(wrapper_class_name, empty_return) {
        var option_values = [];
        $("div." + wrapper_class_name + ".option-wrapper .option.selected").each(function () {
            option_values.push($(this).data('value'));
        });

        if (option_values.length === 0 && typeof empty_return !== "undefined") {
            return empty_return;
        }
        return option_values;
    }

    function getOptionsWrapper() {
        var industry_filter = $('div.industry.option-wrapper select').val();
        return {
            'exchange': getFilterFromSpans("exchange", false),
            'market_cap': getFilterFromSpans("cap", false),
            'sector': getFilterFromSpans("sector", false),
            'region': getFilterFromSpans("region", false),
            'industry': industry_filter ? industry_filter : false
        };
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

    var tool_tip = d3.tip()
        .attr("class", "d3-tip")
        .offset([-8, 0])
        .html(function (d) {
            return "OM: " + d['OM'] + ", TR: " + d['TR'] + ", cId: " + d['company_id'];
        });
    svg.call(tool_tip);

    // Add Axis
    g.append("g").attr("class", "grid x-grid");
    g.append("g").attr("class", "grid y-grid");
    g.append("g").attr("class", "axis x-axis").attr("transform", "translate(0," + height + ")");
    g.append("g").attr("class", "axis y-axis");

    /**** Initiated ****/

    function plotDiagram() {
        if (!diagram_data) {
            return false;
        }
        console.log(diagram_data);
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

        x.domain(d3.extent(diagram_data, function (d) {
            return d['TR'];
        }));
        y.domain(d3.extent(diagram_data, function (d) {
            return d['OM'];
        }));

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
                return color_scale(d['category_index']);
            });

        dots.enter().append("circle")
            .attr("r", dot_radius)
            .attr("class", "dot")
            .merge(dots)
            .on("mouseover", function (d) {
                tool_tip.show(d);

                // handle dot
                d3.select(this).attr("r", dot_radius * 2.5).classed("hover", true);
            })
            .on("mouseout", function () {
                // handle dot
                d3.select(this).attr("r", dot_radius).classed("hover", false);

                tool_tip.hide();
            })
            .transition(t)
            .attr("cx", function (d) {
                return x(d['TR']);
            })
            .attr("cy", function (d) {
                return y(d['OM']);
            })
            .attr("fill", function (d) {
                return color_scale(d['category_index']);
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
