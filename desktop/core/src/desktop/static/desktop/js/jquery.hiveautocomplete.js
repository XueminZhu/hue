// Licensed to Cloudera, Inc. under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  Cloudera, Inc. licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/*
 * jHue generic autocomplete plugin
 * augment a textbox into an generic hive/solr autocomplete
 */

(function ($, window, document, undefined) {
  var pluginName = "jHueGenericAutocomplete",
    defaults = {
      serverType: "HIVE",
      home: "/",
      skipColumns: false,
      onEnter: function () {
      },
      onBlur: function () {
      },
      onPathChange: function () {
      },
      smartTooltip: "",
      smartTooltipThreshold: 10, // needs 10 up/down or click actions and no tab to activate the smart tooltip
      showOnFocus: false,
      startingPath: '',
      rewriteVal: false,
      searchEverywhere: false,
      apiHelperUser: '',
      apiHelperType: '',
    };

  function Plugin(element, options) {
    this.element = element;
    this.options = $.extend({}, defaults, options);
    this._defaults = defaults;
    this._name = pluginName;

    this.apiHelper = null;

    if (typeof ApiHelper !== 'undefined' && this.options.apiHelperUser !== '') {
      this.apiHelper = ApiHelper.getInstance({
        user: this.options.apiHelperUser
      });
    }

    this.init();
  }

  Plugin.prototype.init = function () {
    var self = this;
    var $el = $(self.element);

    // creates autocomplete popover
    if ($("#jHueGenericAutocomplete").length == 0) {
      $("<div>").attr("id", "jHueGenericAutocomplete").addClass("jHueAutocomplete popover")
        .attr("style", "position:absolute;display:none;max-width:1000px;z-index:33000")
        .html('<div class="arrow"></div><div class="popover-inner"><h3 class="popover-title"></h3><div class="popover-content"><ul class="unstyled"></ul></div></div>')
        .appendTo($("body"));
    }

    $el.wrap('<div class="inline">');
    $el.parent().append('<i class="fa fa-spinner fa-spin muted" style="margin-top: 8px; margin-left: -24px; margin-right: 11px; display:none"></i>');

    function setHueBreadcrumbCaretAtEnd(element) {
      var elemLength = element.value.length;
      if (document.selection) {
        element.focus();
        var _oSel = document.selection.createRange();
        _oSel.moveStart('character', -elemLength);
        _oSel.moveStart('character', elemLength);
        _oSel.moveEnd('character', 0);
        _oSel.select();
      }
      else if (element.selectionStart || element.selectionStart == '0') {
        element.selectionStart = elemLength;
        element.selectionEnd = elemLength;
        element.focus();
      }
    }


    $el.focus(function () {
      $(document.body).on("contextmenu", function (e) {
        e.preventDefault(); // prevents native menu on FF for Mac from being shown
      });
      setHueBreadcrumbCaretAtEnd(self.element);
      _pauseBlur = false;
    });

    $el.keydown(function (e) {
      if (e.keyCode == 9) {
        e.preventDefault();
        showAutocomplete(function () {
          var path = $el.val();
          if (path.indexOf(".") > -1) {
            path = path.substr(path.lastIndexOf(".") + 1);
          }
          guessHivePath(path);
        });
      }
    });

    function smartTooltipMaker() {
      if (self.options.smartTooltip != "" && typeof $.totalStorage != "undefined" && $.totalStorage("jHueGenericAutocompleteTooltip") != -1) {
        var cnt = 0;
        if ($.totalStorage("jHueGenericAutocompleteTooltip") != null) {
          cnt = $.totalStorage("jHueGenericAutocompleteTooltip") + 1;
        }
        $.totalStorage("jHueGenericAutocompleteTooltip", cnt);
        if (cnt >= self.options.smartTooltipThreshold) {
          $el.tooltip({
            animation: true,
            title: self.options.smartTooltip,
            trigger: "manual",
            placement: "top"
          }).tooltip("show");
          window.setTimeout(function () {
            $el.tooltip("hide");
          }, 10000);
          $.totalStorage("jHueGenericAutocompleteTooltip", -1);
        }
      }
    }

    $(window).on("scroll", function () {
      $("#jHueGenericAutocomplete").css("top", $el.offset().top + $el.outerHeight() - 1).css("left", $el.offset().left).width($el.outerWidth() - 4);
    });

    var _hiveAutocompleteSelectedIndex = -1;
    var _filterTimeout = -1;
    $el.keyup(function (e) {
      window.clearTimeout(_filterTimeout);
      if ($.inArray(e.keyCode, [17, 38, 40, 13, 32, 191]) == -1) {
        _hiveAutocompleteSelectedIndex = -1;
        _filterTimeout = window.setTimeout(function () {
          var path = $el.val();
          if (path.indexOf(".") > -1) {
            path = path.substr(path.lastIndexOf(".") + 1);
          }
          $("#jHueGenericAutocomplete ul li").show();
          if (path != "") {
            $("#jHueGenericAutocomplete ul li").each(function () {
              if (self.options.searchEverywhere) {
                if ($(this).text().trim().toLowerCase().indexOf(path.toLowerCase()) == -1) {
                  $(this).hide();
                }
              }
              else {
                if ($(this).text().trim().indexOf(path) != 0) {
                  $(this).hide();
                }
              }
            });
          }
        }, 500);
      }
      if (e.keyCode == 38) {
        if (_hiveAutocompleteSelectedIndex <= 0) {
          _hiveAutocompleteSelectedIndex = $("#jHueGenericAutocomplete ul li:visible").length - 1;
        }
        else {
          _hiveAutocompleteSelectedIndex--;
        }
      }
      if (e.keyCode == 40) {
        if (_hiveAutocompleteSelectedIndex == $("#jHueGenericAutocomplete ul li:visible").length - 1) {
          _hiveAutocompleteSelectedIndex = 0;
        }
        else {
          _hiveAutocompleteSelectedIndex++;
        }
      }
      if (e.keyCode == 38 || e.keyCode == 40) {
        smartTooltipMaker();
        $("#jHueGenericAutocomplete ul li").removeClass("active");
        $("#jHueGenericAutocomplete ul li:visible").eq(_hiveAutocompleteSelectedIndex).addClass("active");
        $("#jHueGenericAutocomplete .popover-content").scrollTop($("#jHueGenericAutocomplete ul li:visible").eq(_hiveAutocompleteSelectedIndex).prevAll().length * $("#jHueGenericAutocomplete ul li:visible").eq(_hiveAutocompleteSelectedIndex).outerHeight());
      }
      if ((e.keyCode == 32 && e.ctrlKey) || e.keyCode == 191) {
        smartTooltipMaker();
        showAutocomplete();
      }
      if (e.keyCode == 13) {
        _pauseBlur = true;
        if (_hiveAutocompleteSelectedIndex > -1) {
          $("#jHueGenericAutocomplete ul li:visible").eq(_hiveAutocompleteSelectedIndex).click();
        }
        else {
          self.options.onEnter($(this));
        }
        $("#jHueGenericAutocomplete").hide();
        _hiveAutocompleteSelectedIndex = -1;
      }
    });

    if (self.options.showOnFocus) {
      $el.on("focus", function () {
        showAutocomplete();
      });
    }

    var _pauseBlur = false;

    $el.blur(function () {
      if (!_pauseBlur) {
        $(document.body).off("contextmenu");
        $("#jHueGenericAutocomplete").hide();
        self.options.onBlur();
      }
    });

    var BASE_PATH = "/beeswax/api/autocomplete/";
    if (self.options.serverType == "IMPALA") {
      BASE_PATH = "/impala/api/autocomplete/";
    }
    if (self.options.serverType == "SOLR") {
      BASE_PATH = "/indexer/api/autocomplete/";
    }
    var _currentFiles = [];

    self.getDatabases = function (callback) {
      var self = this;
      self.apiHelper.loadDatabases({
        sourceType: self.options.apiHelperType,
        successCallback: callback,
        silenceErrors: false
      });
    }

    self.getTables = function (database, callback) {
      var self = this;
      self.apiHelper.fetchTables({
        sourceType: self.options.apiHelperType,
        databaseName: database,
        successCallback: callback,
        silenceErrors: false
      });
    }

    self.getColumns = function (database, table, callback) {
      var self = this;
      self.apiHelper.fetchTableDetails({
        sourceType: self.options.apiHelperType,
        databaseName: database,
        tableName: table,
        successCallback: callback,
        silenceErrors: false
      });
    }

    function autocompleteLogic(autocompleteUrl, data) {
      if (data.error == null) {
        _currentFiles = [];

        var _ico = "";
        var _iterable = [];
        var _isSkipColumns = false;

        if (self.options.serverType == "SOLR") {
          _iterable = data.collections;
          _ico = "fa-search";
        }
        else {
          if (data.databases != null) { // it's a db
            _iterable = data.databases;
            _ico = "fa-database";
          }
          else if (data.tables_meta != null) { // it's a table
            _iterable = $.map(data.tables_meta, function (tablesMeta) {
              return tablesMeta.name;
            });
            _ico = "fa-table";
          }
          else {
            if (!self.options.skipColumns) {
              _iterable = data.columns;
              _ico = "fa-columns";
            }
            else {
              _isSkipColumns = true;
            }
          }
        }

        var firstSolrCollection = false;
        var firstSolrConfig = false;

        if (!_isSkipColumns) {
          $(_iterable).each(function (cnt, item) {
            if (self.options.serverType == "SOLR") {
              if (item.isCollection && !firstSolrCollection) {
                _currentFiles.push('<li class="hiveAutocompleteItem" data-value="collections.*" title="collections.*"><i class="fa fa-search-plus"></i> collections.*</li>');
                firstSolrCollection = true;
              }
              if (item.isConfig) {
                _ico = 'fa-cog';
                if (!firstSolrConfig) {
                  _currentFiles.push('<li class="hiveAutocompleteItem" data-value="configs.*" title="configs.*"><i class="fa fa-cogs"></i> configs.*</li>');
                  firstSolrConfig = true;
                }
              }
              _currentFiles.push('<li class="hiveAutocompleteItem" data-value="' + item.name + '" title="' + item.name + '"><i class="fa ' + _ico + '"></i> ' + item.name + '</li>');
            }
            else {
              _currentFiles.push('<li class="hiveAutocompleteItem" data-value="' + item + '" title="' + item + '"><i class="fa ' + _ico + '"></i> ' + item + '</li>');
            }
          });

          $("#jHueGenericAutocomplete").css("top", $el.offset().top + $el.outerHeight() - 1).css("left", $el.offset().left).width($el.outerWidth() - 4);
          $("#jHueGenericAutocomplete").find("ul").empty().html(_currentFiles.join(""));
          $("#jHueGenericAutocomplete").find("li").on("click", function (e) {
            smartTooltipMaker();
            e.preventDefault();
            var item = $(this).text().trim();
            var path = autocompleteUrl.substring(BASE_PATH.length);

            if ($(this).html().indexOf("search") > -1 || $(this).html().indexOf("cog") > -1) {
              if ($(this).html().indexOf("search") > -1 && $(this).html().indexOf("search-plus") == -1) {
                $el.val("collections." + item);
              }
              else if ($(this).html().indexOf("cog") > -1 && $(this).html().indexOf("cogs") == -1) {
                $el.val("configs." + item);
              }
              else {
                $el.val(item);
              }
              self.options.onPathChange($el.val());
              $("#jHueGenericAutocomplete").hide();
              _hiveAutocompleteSelectedIndex = -1;
              self.options.onEnter($el);
            }

            if ($(this).html().indexOf("database") > -1) {
              $el.val(item + ".");
              self.options.onPathChange($el.val());
              showAutocomplete();
            }

            if ($(this).html().indexOf("table") > -1) {
              if ($el.val().indexOf(".") > -1) {
                if ($el.val().match(/\./gi).length == 1) {
                  $el.val($el.val().substring(0, $el.val().lastIndexOf(".") + 1) + item);
                }
                else {
                  $el.val($el.val().substring(0, $el.val().indexOf(".") + 1) + item);
                }
              }
              else {
                if (self.options.rewriteVal) {
                  $el.val(item);
                }
                else {
                  $el.val($el.val() + item);
                }
              }
              if (!self.options.skipColumns) {
                $el.val($el.val() + ".");
              }
              self.options.onPathChange($el.val());
              if (!self.options.skipColumns) {
                showAutocomplete();
              }
              else {
                self.options.onEnter($el);
                $("#jHueGenericAutocomplete").hide();
                _hiveAutocompleteSelectedIndex = -1;
              }
            }

            if ($(this).html().indexOf("columns") > -1) {
              if ($el.val().match(/\./gi).length > 1) {
                $el.val($el.val().substring(0, $el.val().lastIndexOf(".") + 1) + item);
              }
              else {
                $el.val($el.val() + "." + item);
              }
              $("#jHueGenericAutocomplete").hide();
              _hiveAutocompleteSelectedIndex = -1;
              self.options.onEnter($el);
            }

          });
          $("#jHueGenericAutocomplete").show();
          window.setTimeout(function () {
            setHueBreadcrumbCaretAtEnd(self.element);
          }, 100)
          if ("undefined" != typeof callback) {
            callback();
          }
        }
      }
      $el.parent().find('.fa-spinner').hide();
    }

    function showAutocomplete(callback) {
      $el.parent().find('.fa-spinner').show();
      var path = $el.val();
      if (self.options.startingPath != '') {
        path = self.options.startingPath + path;
      }
      var autocompleteUrl = BASE_PATH;

      if (path != "" && path.indexOf(".") == -1) {
        path = "";
      }

      if (path != "" && path.lastIndexOf(".") != path.length - 1) {
        path = path.substring(0, (self.options.startingPath + $el.val()).lastIndexOf("."));
      }

      if (self.options.serverType != "SOLR") {
        autocompleteUrl += path.replace(/\./g, "/");
      }

      if (self.options.serverType != "SOLR" && self.options.apiHelperUser !== '') {
        var suffix = autocompleteUrl.substr(BASE_PATH.length);
        if (suffix === '') {
          self.getDatabases(function (data) {
            autocompleteLogic(autocompleteUrl, {
              databases: data
            });
          });
        }
        else {
          var details = suffix.split('/');
          if (details.length > 1 && details[1] !== '') {
            self.getColumns(details[0], details[1], function (data) {
              autocompleteLogic(autocompleteUrl, {
                columns: $.map(data.cols, function (item) {
                  return item.name
                })
              });
            });
          }
          else {
            self.getTables(details[0], function (data) {
              autocompleteLogic(autocompleteUrl, data);
            });
          }
        }
      }
      else {
        $.getJSON(autocompleteUrl, function (data) {
          autocompleteLogic(autocompleteUrl, data);
        });
      }

    }

    $(document).on("mouseenter", ".hiveAutocompleteItem", function () {
      _pauseBlur = true;
    });

    $(document).on("mouseout", ".hiveAutocompleteItem", function () {
      _pauseBlur = false;
    })

    function guessHivePath(lastChars) {
      var possibleMatches = [];
      for (var i = 0; i < _currentFiles.length; i++) {
        if (($(_currentFiles[i]).text().trim().indexOf(lastChars) == 0 || lastChars == "") && $(_currentFiles[i]).text().trim() != "..") {
          possibleMatches.push(_currentFiles[i]);
        }
      }
      if (possibleMatches.length == 1) {
        $el.val($el.val() + $(possibleMatches[0]).text().trim().substr(lastChars.length));
        if ($(possibleMatches[0]).html().indexOf("folder") > -1) {
          $el.val($el.val() + "/");
          showAutocomplete();
        }
      }
      else if (possibleMatches.length > 1) {
        // finds the longest common prefix
        var possibleMatchesPlain = [];
        for (var z = 0; z < possibleMatches.length; z++) {
          possibleMatchesPlain.push($(possibleMatches[z]).text().trim());
        }
        var arr = possibleMatchesPlain.slice(0).sort(),
          word1 = arr[0], word2 = arr[arr.length - 1],
          j = 0;
        while (word1.charAt(j) == word2.charAt(j))++j;
        var match = word1.substring(0, j);
        $el.val($el.val() + match.substr(lastChars.length));
      }
    }
  };

  Plugin.prototype.setOptions = function (options) {
    this.options = $.extend({}, defaults, options);
  };


  $.fn[pluginName] = function (options) {
    return this.each(function () {
      if (!$.data(this, 'plugin_' + pluginName)) {
        $.data(this, 'plugin_' + pluginName, new Plugin(this, options));
      }
      else {
        $.data(this, 'plugin_' + pluginName).setOptions(options);
      }
    });
  }

  $[pluginName] = function (options) {
    if (typeof console != "undefined") {
      console.warn("$(elem).jHueGenericAutocomplete() is a preferred call method.");
    }
    $(options.element).jHueGenericAutocomplete(options);
  };

})(jQuery, window, document);
