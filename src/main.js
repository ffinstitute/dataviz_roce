window.$ = window.jQuery = require('jquery');

require("bootstrap");
require('bootstrap-select');

var d3 = require("d3");
d3.schemePaired = require("d3-scale-chromatic").schemePaired;
d3.tip = require("d3-tip");

// console.log(math_func);

// dev env #TODO: remove these lines
window.d3 = d3;

$(document).ready(function () {
    var $loading_overlay = $("div.loading"),
        $company_select = $("#company-select"),
        $color_legend_select = $("#color-legend-select"),
        $year_select = $("#year-select"),
        $range_switch = $("#range-switch"),
        $graph_div = $("#graphDiv"),
        optimized_range_on = true,
        pre_diagram_data = {},
        diagram_data = [],
        exchange_list = [],
        market_cap_list = [],
        region_list = [],
        sector_list = [],
        company_data, ROCE_data, graph_div_width, config,
        optimized_range = {
            'TR': [0, 5],
            'OM': [0, 0.25]
        },
        default_color = "#5c5c5c",
        pre_selected_company_data,
        selected_company_data = [];

    // listeners
    $(window).resize(function () {
        var new_graph_div_width = $graph_div.width();
        if (new_graph_div_width !== graph_div_width) {
            plotDiagram();
            graph_div_width = new_graph_div_width;
        }
    });


    // load data
    d3.json('backend/?item=company_list', function (error, data) {
        if (error) {
            company_data = false;
            console.error(error);
        } else {
            company_data = data['companies'];
        }
    });

    d3.json('backend/?item=ROCE_list', function (error, data) {
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

    init();

    // functions


    function init() {
        // Is data ready?
        if (company_data && ROCE_data && config) {
            console.info("Initiating");
            // console.log(ROCE_data);
            // get array of companies(id) with ROCE data
            var company_ids = [];
            $.each(ROCE_data, function (i, datum) {
                var company_id = datum['cId'];
                if (company_ids.indexOf(company_id) === -1) company_ids.push(company_id);
            });

            // prepare company_data by inserting exchange value
            company_data = $.grep($.map(company_data, function (datum1) {
                // console.log(datum);
                var sector = datum1['sector'],
                    exchange = datum1['exchange'];

                if (!sector || sector === "n/a") return false;

                if (exchange_list.indexOf(exchange) === -1) exchange_list.push(exchange);

                // fill sector_list
                if (sector_list.indexOf(sector) === -1) sector_list.push(sector);
                return datum1;
            }), function (datum) {
                return datum !== false && company_ids.indexOf(datum['id']) > -1;
            });


            // init company select
            $.each(company_data, function (i, company) {
                var $option = $('<option value="' + company['symbol'] + '">' + company['name'] + " (" + company['symbol'] + ")" + '</option>')
                    .data({
                        'sector': company['sector'],
                        'exchange': company['exchange'],
                        'market_cap': company['market_cap'],
                        'tokens': company['name'] + " " + company['symbol'],
                        'country': company['country']
                    });
                $company_select.append($option);
            });
            $company_select.selectpicker('refresh');

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

            // as this will init color_scale, which is needed by diagram, we must run this before init diagram
            initColorLegend();

            // init year
            // updateYearOptions(true);

            /** add listeners **/
            $range_switch.on("mouseup", function () {
                optimized_range_on = $range_switch.hasClass("selected");
                updateDiagramWrapper();
            });

            // company select
            $company_select.on("input change", function () {
                var selected = !!$(this).val();
                $(".company-select-wrapper .clear-button-select").toggleClass("hidden", !selected);

                updatePreDiagramWrapper();
            });

            // span click
            $("span.option").on("mousedown", function () {
                $(this).toggleClass("selected");
                if (this.id === "range-switch") {
                    // we only need range-switch to be selected, no pre data update required
                    return;
                }
                updatePreDiagramWrapper();
                updateClearAllButtons();
            });

            // legend select
            $color_legend_select.on('hidden.bs.select', function (e) {
                toggleColorLegend();
                updatePreDiagramWrapper();
            });

            // year select
            $year_select.on('hidden.bs.select', function (e) {
                updateDiagramWrapper();
            });

            // clear all button for span
            $(".clear-button").click(function () {
                $(this).closest(".option-wrapper").find("span").removeClass("selected");
                updatePreDiagramWrapper();
                updateClearAllButtons();
            });

            // clear all button for company select
            $(".clear-button-select").click(function () {
                $(this).closest(".select-wrapper").find('.selectpicker').selectpicker('val', '').trigger('change');

                updatePreDiagramWrapper();
            });

            // select filters
            selectDefaultOptions();
            // then draw graph
            updatePreDiagramWrapper();
        } else if (company_data === false || ROCE_data === false || config === false) {
            // deal with load error
            alert("Something went wrong. See console log for details.");
        } else {
            return setTimeout(init, 100);
        }
    }

    function selectDefaultOptions() {
        selectExchange("NYSE");
        selectExchange("NASDAQ", true);
        selectExchange("AMEX", true);
        selectCap(3e9);
        selectSector("Finance");
        selectSector("Health Care", true);
        selectRegion("United States");
    }

    function initColorLegend() {
        // update color
        $(".option-wrapper").each(function () {
            var $available_options = $(this).find("span.option");
            var color_scale = getColorScale($available_options.length);
            $available_options.each(function (option_index) {
                var color = color_scale(option_index);
                $(this).find(".color-legend-rect").css({background: color});
            });
        });
        // show
        toggleColorLegend();
    }


    /*** programmatically select options ***/
    function switchRange(on) {
        if (optimized_range_on !== on) {
            $range_switch.mousedown().mouseup();
        }
    }

    function selectExchange(exchange_name, keep_non_match) {
        var $wrapper = $(".exchange.option-wrapper");
        $wrapper.find("span.option").each(function () {
            var matched = $(this).data('value') === exchange_name;
            if (keep_non_match) {
                if (matched) $(this).toggleClass("selected", true);
            } else {
                $(this).toggleClass("selected", matched);
            }
        });
        updateClearAllButtons($wrapper);
    }

    function selectCap(market_cap, keep_non_match) {
        var $wrapper = $(".cap.option-wrapper");
        $wrapper.find("span.option").each(function () {
            var range = $(this).data('value');
            var matched = (!range[0] || range[0] < market_cap) && (!range[1] || market_cap < range[1]);
            if (keep_non_match) {
                if (matched) $(this).toggleClass("selected", true);
            } else {
                $(this).toggleClass("selected", matched);
            }
        });
        updateClearAllButtons($wrapper);
    }

    function selectSector(sector_name, keep_non_match) {
        var $wrapper = $(".sector.option-wrapper");
        $wrapper.find("span.option").each(function () {
            var matched = $(this).data('value') === sector_name;
            if (keep_non_match) {
                if (matched) $(this).toggleClass("selected", true);
            } else {
                $(this).toggleClass("selected", matched);
            }
        });
        updateClearAllButtons($wrapper);
    }

    function selectRegion(country_name, keep_non_match) {
        var $wrapper = $(".region.option-wrapper");
        $wrapper.find("span.option").each(function () {
            var matched = $(this).data('value').indexOf(country_name) > -1;
            if (keep_non_match) {
                if (matched) $(this).toggleClass("selected", true);
            } else {
                $(this).toggleClass("selected", matched);
            }
        });
        updateClearAllButtons($wrapper);
    }

    function updateClearAllButtons($wrapper) {
        if (!$wrapper) $wrapper = $(".option-wrapper");
        $wrapper.each(function () {
            var $wrapper = $(this);
            $wrapper.find(".clear-button").toggleClass("invisible", $wrapper.find('.option.selected').length === 0);
        });
    }

    function generateOptionElement(text, value) {
        return $("<span class='option'></span>").text(text).data('value', value)
            .prepend("<div class='color-legend-rect'></div>");
    }

    /***
     * Data changed, so update everything
     */
    function updatePreDiagramWrapper() {
        updatePreDiagramData();
        updateDiagramWrapper();
    }

    /***
     * Data not changed, just filter by year / optimized range
     */
    function updateDiagramWrapper() {
        updateDiagramData();

        if (diagram_data && !diagram_data.length) {
            var selected_year = $year_select.val();
            if (!!pre_diagram_data[selected_year] && pre_diagram_data[selected_year].length) {
                // all data are out of range, turn off optimized range
                console.log("There is data but all out of range, turn off optimized range");
                return switchRange(false);
            }
        }

        plotDiagram();

        if (selected_company_data && !$("circle.selected").length) {
            // company is out of range
            console.log("Company out of range");
            switchRange(false);
        }
    }

    function toggleColorLegend() {
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
    }

    function updatePreDiagramData() {
        var options = getOptionsWrapper(),
            color_legend = $color_legend_select.val(),
            matched_companies = [],
            /*** items of this are objects including keys ['color', 'selected', 'value'] ***/
            exchange_options = options['exchange'],
            market_cap_options = options['market_cap'],
            sector_options = options['sector'],
            region_options = options['region'],
            /*** end of items ***/
            selected_company_symbol = $company_select.val();

        // fill matched_companies
        pre_selected_company_data = false;

        $.each(company_data, function () {
            var company = this,
                is_matched = true,
                is_selected = false,
                color;
            // filter by single company selection, if match, store and push at last
            if (selected_company_symbol && this['symbol'] === selected_company_symbol) {
                is_selected = true;
                pre_selected_company_data = {};
                color = "#000";
            } else {

                // filter by exchange
                is_matched = false;
                exchange_options.forEach(function (option) {
                    if (option['selected'] === true && option['value'] === company['exchange']) {
                        is_matched = true;
                        if (color_legend === "exchange") {
                            color = option['color'];
                        }
                        return false;
                    }
                });
                if (!is_matched) return;

                // filter by market_cap
                is_matched = false;
                market_cap_options.forEach(function (option) {
                    var value = option['value'];
                    if (option['selected'] === true && (!value[0] || value[0] <= company['market_cap']) && (!value[1] || value[1] > company['market_cap'])) {
                        is_matched = true;
                        if (color_legend === "market_cap") {
                            color = option['color'];
                        }
                        return false;
                    }
                });
                if (!is_matched) return;

                // filter by sector
                is_matched = false;
                sector_options.forEach(function (option) {
                    if (option['selected'] === true && option['value'] === company['sector']) {
                        is_matched = true;
                        if (color_legend === "sector") {
                            color = option['color'];
                        }
                        return false;
                    }
                });
                if (!is_matched) return;

                // filter by region
                is_matched = false;
                // var country_list = [].concat.apply([], region_options);
                region_options.forEach(function (option) {
                    if (option['selected'] === true && option['value'].indexOf(company['country']) > -1) {
                        is_matched = true;
                        if (color_legend === "region") {
                            color = option['color'];
                        }
                        return false;
                    }
                });
                if (!is_matched) return;

                if (!color) color = default_color;

            }
            /** Now we have valid companies **/
            matched_companies.push({
                'company_id': this['id'],
                'symbol': this['symbol'],
                'name': this['name'],
                'exchange': this['exchange'],
                'market_cap': this['market_cap'],
                'sector': this['sector'],
                'country': this['country'],
                'color': color,
                'selected': is_selected // here it's just boolean, we will fill it later
            });
        });
        // console.log(matched_companies);
        pre_diagram_data = {};
        if (matched_companies.length === 0) return false;

        // fill diagram_data
        $.each(ROCE_data, function () {
            var ROCE_datum = this;
            var year = this['Y'];

            // console.log(ROCE_datum);

            $.each(matched_companies, function () {
                // console.log("matched company", this);
                if (this['company_id'] === ROCE_datum['cId']) {
                    // fill diagram_data
                    if (!pre_diagram_data[year]) pre_diagram_data[year] = [];
                    pre_diagram_data[year].push($.extend({}, ROCE_datum, this));

                    if (this['selected']) {
                        if (!pre_selected_company_data[year]) pre_selected_company_data[year] = [];
                        pre_selected_company_data[year] = $.extend({}, ROCE_datum, this);
                    }

                    return false;
                }
            });
        });

        updateYearOptions();
    }

    function updateDiagramData() {
        var selected_year = $year_select.val();
        diagram_data = pre_diagram_data[selected_year];
        diagram_data = diagram_data ? diagram_data : [];
        selected_company_data = pre_selected_company_data[selected_year]; // not filtered
        if (optimized_range_on) {
            diagram_data = diagram_data.filter(function (datum) {
                return datum['TR'] <= optimized_range['TR'][1] && datum['TR'] >= optimized_range['TR'][0]
                    && datum['OM'] <= optimized_range['OM'][1] && datum['OM'] >= optimized_range['OM'][0];
            });
        }
    }

    function formatPercentageDisplay(number, decimals, percent_sign) {
        if (typeof decimals === "undefined") decimals = 2;
        if (typeof percent_sign === "undefined") percent_sign = "%";

        return (number * 100).toFixed(decimals) + percent_sign;
    }

    function formatIntDisplay(int, dollar_sign, separator, multiply_base) {
        if (typeof dollar_sign === "undefined") dollar_sign = "$";
        if (typeof separator === "undefined") separator = ",";
        if (typeof multiply_base === "undefined") multiply_base = 1000;

        int = int * multiply_base;

        var strings = [];

        if (int < 1000) {
            strings = [int.toString()];
        } else {
            while (int >= 1000) {
                strings.push(("00" + int % 1000).slice(-3));
                int = Math.floor(int / 1000);
            }
            if (int > 0) {
                strings.push(int);
            }
        }

        strings = strings.reverse();
        strings[0] = Math.round(strings[0]);

        return dollar_sign + strings.join(separator);
    }

    function getColorScale(color_count) {
        var color_scale;
        if (color_count > 12) {
            color_scale = d3.scaleOrdinal(d3.schemeCategory20);
        } else if (color_count > 10) {
            color_scale = d3.scaleOrdinal(d3.schemePaired);
        } else {
            color_scale = d3.scaleOrdinal(d3.schemeCategory10);
        }
        return color_scale;
    }

    function updateYearOptions() {
        // get year list from pre_diagram_data
        var allowed_year_list = ['2014', '2015', '2016'],
            year_list = [];
        if (pre_selected_company_data) {
            year_list = Object.keys(pre_selected_company_data);
        } else {
            year_list = Object.keys(pre_diagram_data);
        }
        year_list = year_list.sort().reverse();

        var selected_year = $year_select.val();

        $year_select.empty();
        $.each(year_list, function () {
            // filter by allowed_year_list
            if (allowed_year_list.indexOf(this.toString()) < 0) return; // this year is not allowed

            var $option = $('<option></option>').prop("value", this).text(this);
            $year_select.append($option);
        });
        if (year_list.indexOf(selected_year) > -1) {
            // already selected a year in list
            $year_select.val(selected_year);
            $year_select.selectpicker('refresh');
        } else {
            // we need to select another year coz the year selected is not in the list
            $year_select.val(year_list[0]);
            $year_select.selectpicker('refresh');
            // updateDiagramWrapper();
        }
    }

    function showLoading(to_show) {
        var is_hidden_now = $loading_overlay.is(":hidden");

        if (to_show && is_hidden_now) {
            $loading_overlay.show();
        } else if (!to_show && !is_hidden_now) {
            $loading_overlay.hide();
        }
    }

    function getShadeAreaData(min, max, x_domain) {
        var shade_data = [],
            x_min = x_domain[0],
            x_max = x_domain[1],
            step = (x_max - x_min) / 100;
        for (var xx = x_min + step; xx <= x_max; xx += step) {
            shade_data.push({
                x: xx,
                y1: min / xx,
                y2: max / xx
            })
        }
        return [shade_data];
    }

    /*** Get Filters ***/
    function getFilterFromSpans(wrapper_class_name, empty_return) {
        var options = [];
        $("div." + wrapper_class_name + ".option-wrapper .option").each(function () {
            var option = {
                value: $(this).data('value'),
                selected: $(this).hasClass("selected")
            };
            if ($(this).find(".color-legend-rect").length) {
                option['color'] = $(this).find(".color-legend-rect").css("background-color");
            }
            options.push(option);
        });

        if (options.length === 0 && typeof empty_return !== "undefined") {
            return empty_return;
        }
        return options;
    }

    function getOptionsWrapper() {
        return {
            'exchange': getFilterFromSpans("exchange", false),
            'market_cap': getFilterFromSpans("cap", false),
            'sector': getFilterFromSpans("sector", false),
            'region': getFilterFromSpans("region", false)
        };
    }

    /****** Initiate ******/
    var outer_width, width, x, y, x_axis, y_axis,
        outer_height = 400,
        margin = {top: 20, right: 0, bottom: 30, left: 50},
        padding = {top: 0, right: 0, bottom: 4, left: 0},
        height = outer_height - margin.top - margin.bottom,
        dot_radius = 4; //pixels


    // append svg
    var svg = d3.select("#graphDiv svg"),
        g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    // init tooltips
    var dot_tool_tip = d3.tip()
        .attr("class", "d3-tip")
        .direction('s')
        .offset([8, 0])
        .html(function (d) {
            return "<table><thead><tr><th colspan='2'>" + d['name'] + " (" + d['symbol'] + ")</th></tr></thead><tbody>"
                + "<tr><th>" + "Exchange" + "</th><td>" + d['exchange'] + "</td></tr>"
                + "<tr><th>" + "Market Cap" + "</th><td>" + formatIntDisplay(d['market_cap'], "$", ",", 1) + "</td></tr>"
                + "<tr><th>" + "Sector" + "</th><td>" + d['sector'] + "</td></tr>"
                + "<tr><th>" + "Country" + "</th><td>" + d['country'] + "</td></tr>"
                + "<tr><th>" + "Total Revenue" + "</th><td>" + formatIntDisplay(d['TRV']) + "</td></tr>"
                + "<tr><th>" + "Tax Rate" + "</th><td>" + formatPercentageDisplay(d['TXR']) + "</td></tr>"
                + "<tr><th>" + "Operating Income" + "</th><td>" + formatIntDisplay(d['OI']) + "</td></tr>"
                + "<tr><th>" + "Capital Employed" + "</th><td>" + formatIntDisplay(d['CE']) + "</td></tr>"
                + "<tr><th>" + "Turnover Ratio" + "</th><td>" + d['TR'] + "</td></tr>"
                + "<tr><th>" + "Operating Margin" + "</th><td>" + formatPercentageDisplay(d['OM']) + "</td></tr>"
                + "<tr><th>" + "ROCE" + "</th><td>" + formatPercentageDisplay(d['RC']) + "</td></tr>"
                + "</thead></table>";
        });

    var shade_tool_tip = d3.tip()
        .attr("class", "d3-tip")
        .direction('s')
        .html(function (d) {
            var d0 = d[0];
            return "ROCE range(%): " + d0['x'] * d0['y1'] * 100 + " - " + d0['x'] * d0['y2'] * 100;
        });

    svg.call(dot_tool_tip);
    svg.call(shade_tool_tip);

    // Add Axis
    g.append("g").attr("class", "grid x-grid");
    g.append("g").attr("class", "grid y-grid");
    g.append("g").attr("class", "axis x-axis").attr("transform", "translate(0," + (height - padding.bottom) + ")");
    g.append("g").attr("class", "axis y-axis");


    // Add axis label
    g.append("text")
        .attr("class", "axis-label x hidden")
        .style("text-anchor", "middle")
        .text("Turnover Ratio");
    g.append("text")
        .attr("class", "axis-label y hidden")
        .attr("transform", "rotate(-90)")
        .style("text-anchor", "middle")
        .attr("dy", "1em")
        .text("Margin(%)");

    // Add shade areas
    g.append("path")
        .attr("class", "shade-area shade-area-1");
    g.append("path")
        .attr("class", "shade-area shade-area-2");

    /**** Initiated ****/

    function plotDiagram() {
        // console.log(diagram_data);
        console.info(Date.now() % 100000 + ' Ploting data with ' + diagram_data.length + ' dots');
        var outer_div_width = $graph_div.width();
        outer_width = Math.max(outer_div_width, 500);

        width = outer_width - margin.left - margin.right;
        x = d3.scaleLinear().range([0, width]);
        y = d3.scaleLinear().range([height - padding.bottom, 0]);
        x_axis = d3.axisBottom(x);
        y_axis = d3.axisLeft(y).tickFormat(function (d) {
            return formatPercentageDisplay(d, 0, "");
        });

        // console.log(data);

        // update svg
        var svg_offset = ($("div.container").width() - outer_width) / 2;
        svg.attr("width", outer_div_width - svg_offset * 2)
            .attr("height", height + margin.top + margin.bottom)
            .style("margin-left", svg_offset);


        // update according to range switch
        if (optimized_range_on) {
            x.domain(optimized_range['TR']);
            y.domain(optimized_range['OM']);
        } else {
            if (diagram_data.length) {
                var x_range = d3.extent(diagram_data, function (d) {
                        return d['TR'];
                    }),
                    y_range = d3.extent(diagram_data, function (d) {
                        return d['OM'];
                    }),

                    x_padding = (x_range[1] - x_range[0]) / 10,
                    y_padding = (y_range[1] - y_range[0]) / 10;

                x_padding = x_padding === 0 ? 1 : x_padding;
                y_padding = y_padding === 0 ? 0.05 : y_padding;

                x.domain([x_range[0] < 0 ? x_range[0] - x_padding : 0, x_range[1] + x_padding]);
                y.domain([y_range[0] < 0 ? y_range[0] - y_padding : 0, y_range[1] + y_padding]);
            }
        }

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

        // update general dots
        var dots = g.selectAll("circle.general").data(diagram_data);

        dots.exit().remove();

        dots.attr("class", function (d) {
            if (d['selected']) {
                return "dot general selected";
            } else {
                return "dot general";
            }
        });

        dots.enter().append("circle")
            .attr("r", dot_radius)
            .attr("class", function (d) {
                if (d['selected']) {
                    return "dot general selected";
                } else {
                    return "dot general";
                }
            })
            .merge(dots)
            .on("mouseover", function (d) {
                dot_tool_tip.show(d);

                // handle dot
                d3.select(this).attr("r", dot_radius * 2.5).classed("hover", true);
            })
            .on("mouseout", function () {
                // handle dot
                d3.select(this).attr("r", dot_radius).classed("hover", false);

                dot_tool_tip.hide();
            })
            .attr("cx", function (d) {
                return x(d['TR']);
            })
            .attr("cy", function (d) {
                return y(d['OM']);
            })
            .attr("fill", function (d) {
                return d['color'];
            });

        // console.log("selected company data", pre_selected_company_data);

        // Update Axis
        g.select(".x-axis")
            .transition(t)
            .call(x_axis);

        g.select(".y-axis")
            .transition(t)
            .call(y_axis);

        // text label for axis
        g.select(".axis-label.x")
            .classed("hidden", false)
            .transition(t)
            .attr("transform",
                "translate(" + (width / 2) + " ," +
                (height + margin.top + 5) + ")");

        g.select(".axis-label.y")
            .classed("hidden", false)
            .transition(t)
            .attr("y", 12 - margin.left - Math.round(y.domain()[1]).toString().length * 4)
            .attr("x", -(height / 2));

        // Update shade area
        d3.select(".shade-area-1").data(getShadeAreaData(0.05, 0.1, x.domain()))
            .on("mouseover", function (d) {
                shade_tool_tip.offset([-10, 0]).show(d);
                // handle dot
                d3.select(this).classed("hover", true);
            });
        d3.select(".shade-area-2").data(getShadeAreaData(0.15, 0.2, x.domain()))
            .on("mouseover", function (d) {
                shade_tool_tip.offset([-40, 0]).show(d);
                // handle dot
                d3.select(this).classed("hover", true);
            });
        d3.selectAll(".shade-area")
            .attr("d", d3.area().x(function (d) {
                return x(d['x']);
            }).y0(function (d) {
                return y(d['y1'])
            }).y1(function (d) {
                return y(d['y2']);
            }))
            .on("mouseout", function () {
                // handle dot
                d3.select(this).classed("hover", false);
                shade_tool_tip.hide();
            });

        // Update selected company cross
        // Add selected company cross
        g.selectAll("line.selected-company-cross").remove();

        if (selected_company_data) {
            g.append("line")
                .attr("class", "selected-company-cross selected-company-cross-x")
                .attr("x1", x(x.domain()[0]))
                .attr("y1", y(selected_company_data['OM']))
                .attr("x2", x(x.domain()[1]))
                .attr("y2", y(selected_company_data['OM']));

            g.append("line")
                .attr("class", "selected-company-cross selected-company-cross-y")
                .attr("x1", x(selected_company_data['TR']))
                .attr("y1", y(y.domain()[0]))
                .attr("x2", x(selected_company_data['TR']))
                .attr("y2", y(y.domain()[1]));


            g.selectAll("line.selected-company-cross")
                .on("mouseover", function () {
                    g.selectAll("line.selected-company-cross").classed("hover", true);
                    g.selectAll("circle.selected").dispatch("mouseover");
                })
                .on("mouseout", function () {
                    g.selectAll("line.selected-company-cross").classed("hover", false);
                    g.selectAll("circle.selected").dispatch("mouseout");
                });
            // put selected company dot to top
            $graph_div.find('svg>g').append($('circle.selected'));
        }
    }
})
;
