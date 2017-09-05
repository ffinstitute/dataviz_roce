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
        $shade_switch = $("#shade-switch"),
        $graph_div = $("#graphDiv"),
        shade_on = true,
        optimized_range_on = true,
        diagram_data = [],
        exchange_list = [],
        year_list = [],
        market_cap_list = [],
        region_list = [],
        sector_list = [],
        industry_dict = {},
        company_data, ROCE_data, graph_div_width, config,
        optimized_range = {
            'TR': [0, 5],
            'OM': [0, 0.25]
        },
        default_color = "#5c5c5c";


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
                    industry = datum1['industry'],
                    exchange = datum1['exchange'];

                if (!sector || !industry || sector === "n/a" || industry === "n/a") return false;

                if (exchange_list.indexOf(exchange) === -1) exchange_list.push(exchange);

                // fill sector_list, industry_list
                if (sector_list.indexOf(sector) === -1) sector_list.push(sector);
                industry_dict[industry] = sector;
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

            // as this will init color_scale, which is needed by diagram, we must run this before init diagram
            initColorLegend();

            // init year
            updateYearOptions(true);

            /** add listeners **/
            $range_switch.on("mouseup", function () {
                optimized_range_on = $range_switch.hasClass("selected");
                updateDiagramWrapper();
            });
            $shade_switch.on("mouseup", function () {
                shade_on = $shade_switch.hasClass("selected");
                updateDiagramWrapper();
            });

            // company select
            $company_select.on("input change", function () {
                var option_data = $(this).find("option:selected").data();
                if (option_data) {
                    switchRange(false);
                    selectExchange(option_data['exchange']);
                    selectCap(option_data['market_cap']);
                    selectSector(option_data['sector']);
                    selectRegion(option_data['country']);

                    updateDiagramWrapper();
                }
            });

            // span click
            $("span.option").on("mousedown", function () {
                $(this).toggleClass("selected");
                updateDiagramWrapper();
                updateClearAllButtons();
            });

            // legend select
            $color_legend_select.on('hidden.bs.select', function (e) {
                toggleColorLegend();
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

                selectSector(sector_name);
                updateDiagramWrapper();
            });

            // select filters
            selectDefaultOptions();
            // then draw graph
            updateDiagramWrapper();
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
        selectCap(3e9);
        selectSector("Consumer Services");
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

    function updateDiagramWrapper(skip_update_year) {
        updateDiagramData(skip_update_year);
        plotDiagram();
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

    function updateDiagramData(skip_update_year) {
        diagram_data = [];

        var options = getOptionsWrapper(),
            color_legend = $color_legend_select.val(),
            matched_companies = [],
            /*** items of this are objects including keys ['color', 'selected', 'value'] ***/
            exchange_options = options['exchange'],
            market_cap_options = options['market_cap'],
            sector_options = options['sector'],
            region_options = options['region'],
            /*** end of items ***/
            industry_options = options['industry'],
            selected_company_symbol = $company_select.val();

        $.each(company_data, function () {
            // filter by single company selection
            if (selected_company_symbol) {
                if (this['symbol'] !== selected_company_symbol) return;
            } else {
                var company = this,
                    matched = true;

                // filter by exchange
                matched = false;
                exchange_options.forEach(function (option) {
                    if (option['selected'] === true && option['value'] === company['exchange']) {
                        matched = true;
                        if (color_legend === "exchange") {
                            color = option['color'];
                        }
                        return false;
                    }
                });
                if (!matched) return;

                // filter by market_cap
                matched = false;
                market_cap_options.forEach(function (option) {
                    var value = option['value'];
                    if (option['selected'] === true && (!value[0] || value[0] <= company['market_cap']) && (!value[1] || value[1] > company['market_cap'])) {
                        matched = true;
                        if (color_legend === "market_cap") {
                            color = option['color'];
                        }
                        return false;
                    }
                });
                if (!matched) return;

                // filter by sector
                matched = false;
                sector_options.forEach(function (option) {
                    if (option['selected'] === true && option['value'] === company['sector']) {
                        matched = true;
                        if (color_legend === "sector") {
                            color = option['color'];
                        }
                        return false;
                    }
                });
                if (!matched) return;

                // filter by region
                matched = false;
                // var country_list = [].concat.apply([], region_options);
                region_options.forEach(function (option) {
                    if (option['selected'] === true && option['value'].indexOf(company['country']) > -1) {
                        matched = true;
                        if (color_legend === "region") {
                            color = option['color'];
                        }
                        return false;
                    }
                });
                if (!matched) return;

                // filter by industry
                if (industry_options && industry_options.indexOf(this['industry']) < 0) {
                    return;
                }

                if (!color) color = default_color;
            }

            /** Now we have valid companies **/
            matched_companies.push({
                'company_id': this['id'],
                'symbol': this['symbol'],
                'name': this['name'],
                'color': color
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

            if (optimized_range_on) {
                if (ROCE_datum['TR'] > optimized_range['TR'][1] || ROCE_datum['TR'] < optimized_range['TR'][0]) return;
                if (ROCE_datum['OM'] > optimized_range['OM'][1] || ROCE_datum['OM'] < optimized_range['OM'][0]) return;
            }

            $.each(matched_companies, function () {
                // console.log("matched company", this);
                if (this['company_id'] === ROCE_datum['cId']) {
                    if (year_list.indexOf(year) === -1) {
                        year_list.push(year);
                    }

                    if (!selected_year || year === selected_year) {
                        var diagram_datum = $.extend({}, ROCE_datum, this);
                        diagram_data.push(diagram_datum);
                    }

                    return false;
                }
            });
        });

        if (!skip_update_year) updateYearOptions();
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
            if (!do_init) updateDiagramWrapper(true);
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
        var industry_filter = $('div.industry.option-wrapper select').val();
        return {
            'exchange': getFilterFromSpans("exchange", false),
            'market_cap': getFilterFromSpans("cap", false),
            'sector': getFilterFromSpans("sector", false),
            'region': getFilterFromSpans("region", false),
            'industry': industry_filter ? industry_filter : false
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

    var tool_tip = d3.tip()
        .attr("class", "d3-tip")
        .direction('s')
        .offset([8, 0])
        .html(function (d) {
            return "<table><thead><tr><th colspan='2'>" + d['name'] + " (" + d['symbol'] + ")</th></tr></thead><tbody>"
                + "<tr><th>" + "Total Revenue" + "</th><td>" + formatIntDisplay(d['TRV']) + "</td></tr>"
                + "<tr><th>" + "Tax Rate" + "</th><td>" + formatPercentageDisplay(d['TXR']) + "</td></tr>"
                + "<tr><th>" + "Operating Income" + "</th><td>" + formatIntDisplay(d['OI']) + "</td></tr>"
                + "<tr><th>" + "Capital Employed" + "</th><td>" + formatIntDisplay(d['CE']) + "</td></tr>"
                + "<tr><th>" + "Turnover Ratio" + "</th><td>" + d['TR'] + "</td></tr>"
                + "<tr><th>" + "Operating Margin" + "</th><td>" + formatPercentageDisplay(d['OM']) + "</td></tr>"
                + "<tr><th>" + "ROCE" + "</th><td>" + formatPercentageDisplay(d['RC']) + "</td></tr>"
                + "</thead></table>";
        });
    svg.call(tool_tip);

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

    // Add shade area
    g.append("path")
        .attr("class", "shade-area");

    /**** Initiated ****/

    function plotDiagram() {
        if (!diagram_data) {
            return false;
        }

        // console.log(diagram_data);
        console.info(Date.now() % 100000, "Ploting data");
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
            x.domain([d3.min(diagram_data, function (d) {
                return d['TR'] > 0 ? 0 : d['TR'];
            }), d3.max(diagram_data, function (d) {
                return d['TR'];
            })]);
            y.domain([d3.min(diagram_data, function (d) {
                return d['OM'] > 0 ? 0 : d['OM'];
            }), d3.max(diagram_data, function (d) {
                return d['OM'];
            })]);
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
        var dots = g.selectAll("circle").data(diagram_data);

        dots.exit()
            .classed("exit", true)
            .attr("r", dot_radius * 5)
            .style("fill-opacity", 1e-6)
            .remove();

        dots.classed("update", true)
            .attr("fill", function (d) {
                return d['color'];
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
            .attr("cx", function (d) {
                return x(d['TR']);
            })
            .attr("cy", function (d) {
                return y(d['OM']);
            })
            .attr("fill", function (d) {
                return d['color'];
            });

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
        if (shade_on) {
            var shade_data = [];
            for (var xx = 1e-1; xx <= x.domain()[1]; xx += 1e-1) {
                shade_data.push({
                    x: xx,
                    y1: 0.15 / xx,
                    y2: 0.2 / xx
                })
            }
            d3.select(".shade-area")
                .data([shade_data])
                .classed("hidden", false)
                .attr("d", d3.area().x(function (d) {
                    return x(d['x']);
                }).y0(function (d) {
                    return y(d['y1'])
                }).y1(function (d) {
                    return y(d['y2']);
                }));
        } else {
            d3.select(".shade-area").classed("hidden", true);
        }


    }
});
