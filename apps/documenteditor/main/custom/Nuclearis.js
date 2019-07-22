/**
 *    Nuclearis.js
 *
 *    Created by Anderson Martiniano on 24 July 2018
 *    Copyright (c) 2018 Nuclearis LTDA. All rights reserved.
 *
 */

define([
    'jquery',
    'underscore',
    'backbone',
    'gateway',
    'documenteditor/main/custom/AtalhoSettingsDialog',
], function ($, _, Backbone, gateway) {
    Common.Nuclearis = new (function() {
        var _guidConstrutorDeLaudo = "asc.{A8705DEE-7544-4C33-B3D5-168406D92F72}";
        var _guidNuclearisMacros = "asc.{6C5EFDEE-127E-11E8-B642-0ED5F89F718B}";
        var _mainController = null;
        var _buffer = {startPos: null, endPos: null, text: ''};
        var _itensBuffer = [];
        var _atalhoAutoCompleteMenu = null;
        var _renderMenu = true;
        var _atalhos = null;
        var _categoriasDeAtalho = null;
        var _infoObj = {
            PageCount       : 0,
            WordsCount      : 0,
            ParagraphCount  : 0,
            SymbolsCount    : 0,
            SymbolsWSCount  : 0
        };
        var me = this;
        var _signaturesBlock = null;

        var _state = {
            isFromNuclearisDownloadAsDocx : false,
            isFromNuclearisDownloadAsPdf : false,
        };

        var onInternalCommand = function(objData) 
        {            
            //Force Save
            if ( objData != null && objData.command == "forceSave" )
            {
                window.AscDesktopEditor_Save();
            }

            //Inserir Assinatura
            if ( objData != null && objData.command == "inserirAssinatura" )
            {
                _signaturesBlock = objData.data;
                
                if ( !_signaturesBlock.signatures )
                {
                    //Não tem campo signatures, está no padrão antigo, ajustar
                    _signaturesBlock = {
                        redoSignatures: false,
                        signatures: [
                            {   
                                width: objData.data.width,
                                height: objData.data.height,
                                image: objData.data.imagem,
                                extras: objData.data.extras
                            }
                        ]
                    }
                }

                if ( _signaturesBlock.redoSignatures )
                {
                    _mainController.api.nuclearis_redoSignatures();
                }

                processNextSignature();
            }

            //getDocInfo
            if ( objData != null && objData.command == "getDocInfo" )
            {
                _mainController.api.startGetDocInfo();
            }

            if ( objData != null && objData.command == "insertMeasurementHyperlink" )
            {
                insertMeasurementHyperlink(objData.data);
            }

            if ( objData != null && objData.command == "removeMeasurementHyperlink" )
            {
                _mainController.api.nuclearis_removeMeasurementHyperlink(objData.data);
            }

            if ( objData != null && objData.command == "replaceContentControls" )
            {
                _mainController.api.nuclearis_replaceContentControls(_mainController.editorConfig.macros);
            }

            if ( objData != null && objData.command == "uploadAndInsertImage" )
            {
                uploadAndInsertImage(objData.data);
            }
            
        };

        var insertMeasurementHyperlink = function(hyperlink)
        {
            var props, text;

            if ( hyperlink && _mainController.api )
            {

                props   = new Asc.CHyperlinkProperty(),
                url     = $.trim(hyperlink.url);

                if ( ! /(((^https?)|(^measurement)):\/\/)|(^mailto:)/i.test(url) )
                    url = 'measurement://'  + url;

                url = url.replace(new RegExp("%20",'g')," ");

                text = _mainController.api.can_AddHyperlink();

                if ( text !== false ) 
                {
                    props.put_Value(url);
                    props.put_Text(hyperlink.text);
                    props.put_ToolTip(hyperlink.tooltip);

                    if ( !_.isEmpty($.trim(text)) ) 
                    {
                        props.put_Text(text);
                    }

                    _mainController.api.add_Hyperlink(props);
                }
                else
                {
                    var selectedElements = _mainController.api.getSelectedElements();
                    if ( selectedElements && _.isArray(selectedElements) )
                    {
                        _.each( selectedElements, function(el, i) {
                            if ( selectedElements[i].get_ObjectType() == Asc.c_oAscTypeSelectElement.Hyperlink )
                                props = selectedElements[i].get_ObjectValue();
                        });
                    }

                    if ( props ) 
                    {
                        props.put_Value(url);
                        props.put_ToolTip(hyperlink.tooltip);
                        _mainController.api.change_Hyperlink(props);
                    }
                }
            }
        }

        var generateRandomName = function(){
            return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        }

        var uploadAndInsertImage = function(base64Image){
            if ( !_.isEmpty(base64Image) )
            {
                urltoFile(base64Image, generateRandomName()+'.png').then(function(file)
                {
                    _mainController.api.nuclearis_uploadAndInsertImage(file);
                });
            }
        }

        var processNextSignature = function()
        {
            if ( _signaturesBlock.signatures.length > 0 )
            {
                var signature = _signaturesBlock.signatures.shift();
                processSignatureBlock(signature);
            }
            else
            {
                // var config = {
                //     closable: false,
                //     title: "Sucesso",
                //     msg: "Área de assinaturas atualizada com sucesso!",
                //     iconCls: 'info',
                //     buttons: ['ok']
                // };
                
                // Common.UI.alert(config);

                _mainController.api.nuclearis_recalculate();

                _mainController.getApplication().getController('Statusbar').setStatusCaption("Área de assinaturas atualizada com sucesso!");
            }
        }

        var processSignatureBlock = function(signerBlock)
        {
            var signaturesPerLine = 2;
            if ( _mainController && _mainController.editorConfig && _mainController.editorConfig.signaturesPerLine )
            {
                signaturesPerLine = _mainController.editorConfig.signaturesPerLine;		
            }
            
            if ( signerBlock != null )
            {
                //Verifica se assintura tem imagem, se sim, carrega a imagem antes de inserir assinatura
                if ( signerBlock.image && signerBlock.image !== null && signerBlock.image !== '' )
                {
                    urltoFile(signerBlock.image, generateRandomName()+'.png').then(function(file)
                    {
                        _mainController.api.nuclearis_uploadAndInsertSignatureImage(file, function(image_url){
                            signerBlock.image = image_url;
                            _mainController.api.nuclearis_insertSignature(signerBlock, signaturesPerLine);
                            processNextSignature();
                        });
                    });
                }
                else
                {
                    _mainController.api.nuclearis_insertSignature(signerBlock, signaturesPerLine);
                    processNextSignature();
                }
            }
        }

        //return a promise that resolves with a File instance
        var urltoFile = function(url, filename, mimeType)
        {
            mimeType = mimeType || (url.match(/^data:([^;]+);/)||'')[1];
            return (fetch(url)
                .then(function(res){
                    return res.arrayBuffer();
                })
                .then(function(buf){
                    return new File([buf], filename, {type:mimeType});
                })
                .catch(function(err){
                    console.log(err);
                })
            );
        }

        var onInit = function(loadConfig) {
        
            var currentValueAutocompleteAtalho = Common.localStorage.getItem("de-settings-autocomplete-atalho");
            if ( currentValueAutocompleteAtalho === null )
            {
                currentValueAutocompleteAtalho = 0;
                Common.localStorage.setItem("de-settings-autocomplete-atalho", currentValueAutocompleteAtalho);
            }

            if ( _mainController == null )
            {
                try { _mainController = DE.getController('Main'); } catch(e) {
                    try { _mainController = PE.getController('Main'); } catch(e) {
                        try { _mainController =  SSE.getController('Main'); } catch(e) {}
                    }
                }
            }

            var application = _mainController.getApplication();
            var documentHolderView =  application.getController('DocumentHolder').getView('DocumentHolder');

            var menuAddShortcutPara = new Common.UI.MenuItem({
                caption     : 'Adicionar Atalho'
            }).on('click', _.bind(adicionarAtalhoDialog, me));

            menuAddShortcutPara.setVisible(true);

            _mainController.api.asc_registerCallback('asc_onContextMenu', function()
            {
                
                var selectedElements =  _mainController.api.getSelectedElements();
                var menu_item_props = getMenuItemProps(selectedElements);

                menuAddShortcutPara.menu_item_props = menu_item_props;

                menuAddShortcutPara.menu_item_props.selectedText = _mainController.api.nuclearis_getSelectedText(true);

                if ( menu_item_props.hasSpellCheck && !menu_item_props.spellProps.value.Checked )
                {
                    documentHolderView.textMenu.insertItem(-1, menuAddShortcutPara);
                }
                else
                {
                    documentHolderView.textMenu.insertItem(0, menuAddShortcutPara);
                } 
            });

            _atalhoAutoCompleteMenu = new Common.UI.Menu({
                items: [ ]
            }).on('item:click', function (menu, item, e) {
                _mainController.api.nuclearis_replaceShortcut(item.value, _atalhos[item.value], _buffer, _itensBuffer);
            });

            if ( _mainController && _mainController.editorConfig && _mainController.editorConfig.atalhos )
            {
                _atalhos = _mainController.editorConfig.atalhos;		
            }

            //Aciona o replace de content controls quand qualquer outro plugin fechar
            if ( !_mainController.api.asc_checkNeedCallback('asc_onPluginClose') )
            {
                _mainController.api.asc_registerCallback('asc_onPluginClose', function(plugin)
                {
                    _mainController.api.nuclearis_replaceContentControls(_mainController.editorConfig.macros);
                });
            }

            if ( !_mainController.api.asc_checkNeedCallback('asc_onPluginShow' ))
            {
                _mainController.api.asc_registerCallback('asc_onPluginShow', function(plugin)
                {
                    if ( plugin.guid === _guidNuclearisMacros )
                    {					
                        var _plugin = window.g_asc_plugins.runnedPluginsMap[_guidNuclearisMacros];
                        if ( !_plugin )
                            return;

                        _plugin.startData.setAttribute("macros", _mainController.editorConfig.macros);
                        _plugin.startData.setAttribute("macrosDeQuestionario", _mainController.editorConfig.macrosDeQuestionario);
                    }
                });
            }

            //Estatisticas
            _mainController.api.asc_registerCallback('asc_onDocInfo', function(obj)
            {
                if ( obj ) 
                {
                    if ( obj.get_PageCount() > -1 )
                        _infoObj.PageCount = obj.get_PageCount();
                    if ( obj.get_WordsCount() > -1 )
                        _infoObj.WordsCount = obj.get_WordsCount();
                    if ( obj.get_ParagraphCount() > -1 )
                        _infoObj.ParagraphCount = obj.get_ParagraphCount();
                    if ( obj.get_SymbolsCount() > -1 )
                        _infoObj.SymbolsCount = obj.get_SymbolsCount();
                    if ( obj.get_SymbolsWSCount() > -1 )
                        _infoObj.SymbolsWSCount = obj.get_SymbolsWSCount();
                }
            });

            _mainController.api.asc_registerCallback('asc_onGetDocInfoEnd', function()
            {
                Common.Gateway.metaChange({type: 'docInfo' ,info:  _infoObj});
            });

            //Botão na Barra de Status
            var statusbarView = DE.getController('Statusbar').getView('Statusbar');
            statusbarView.$el.find('.status-group:last').prepend('<button id="btn-complete-atalho" type="button" class="btn small btn-toolbar el-edit"><span class="btn-icon" style="background-position: var(--bgX) -920px">&nbsp;</span></button>');
            statusbarView.$el.find('.status-group:last').prepend('<div class="separator short el-edit"></div>');
            var btnCompleteAtalho = new Common.UI.Button({
                el: $('#btn-complete-atalho',statusbarView.el),
                enableToggle: true,
                hint: "Exibir sugestões de atalhos",
                hintAnchor: 'top'
            });

            var currentValueAutocompleteAtalho = Common.localStorage.getItem("de-settings-autocomplete-atalho");
            btnCompleteAtalho.toggle(currentValueAutocompleteAtalho===null || parseInt(currentValueAutocompleteAtalho) == 1, true);

            btnCompleteAtalho.on('click', function() 
            {
                var value = Common.localStorage.getItem("de-settings-autocomplete-atalho");;
                value = 1 - value;
                Common.localStorage.setItem("de-settings-autocomplete-atalho", value);
                btnCompleteAtalho.toggle(value===null || parseInt(value) == 1, true);
            });

            _mainController.api.asc_registerCallback('nuclearis_onShortcutsFounded', function(itens)
            {
                if ( itens.length > 0 )
                {
                    if ( !_.isEqual(itens, _itensBuffer ))
                    {
                        _itensBuffer = itens;
                        var currentValueAutocompleteShortcut = parseInt(Common.localStorage.getItem("de-settings-autocomplete-atalho"))
                        if ( currentValueAutocompleteShortcut === 1 )
                        {
                            showShortcutsPopupMenu(itens);          
                        }                         
                    }
                }
                else
                {
                    if ( _atalhoAutoCompleteMenu.isVisible() )
                    {
                        _atalhoAutoCompleteMenu.hide();
                        _itensBuffer = [];
                    }
                }
            });
            
            if ( loadConfig.config.mode == "edit" )
            {
                configureDownloadDocumentAsDocxButton();
                configureDownloadDocumentAsPdfButton();
                
                _mainController.api.asc_registerCallback('asc_onDocumentContentReady', function()
                {
                    _mainController.api.nuclearis_registerCallbacks();
                });
            }

            _mainController.api.asc_registerCallback('asc_onHyperlinkClick', function(url)
            {
                if ( url ) 
                {
                    if ( url.startsWith("measurement://") )
                    {
                        Common.Gateway.internalMessage('showMeasurement', url.replace("measurement://", ""));
                    }
                    else
                    {
                        window.open(url);
                    }
                }
            });

            _mainController.api.asc_registerCallback('asc_onDocumentContentReady', function ()
            {
                 this.nuclearis_replaceContentControls(_mainController.editorConfig.macros);
            });
        };      

        var configureDownloadDocumentAsDocxButton = function()
        {
            var leftMenuView = DE.getController('LeftMenu').getView('LeftMenu');
            leftMenuView.$el.find('.tool-menu-btns:last').append('<button id="left-btn-download-document-docx" class="btn btn-category"><span class="btn-icon img-toolbarmenu" style="background-position: var(--bgX) -1401px">&nbsp;</span></button>');
            //statusbarView.$el.find('.tool-menu-btns:last').prepend('<div class="separator short el-edit"></div>');
            
            leftMenuView.btnDownloadDocument = new Common.UI.Button({
                el: $('#left-btn-download-document-docx',leftMenuView.el),
                enableToggle: true,
                disabled: true,
                hint: "Realiza o download do documento em formato docx (compativel com o Microsoft Word)"
            });

            leftMenuView.$el.find('#left-btn-download-document-docx span').css('background-image', "url('./resources/img/ms-word.png'");
            leftMenuView.$el.find('#left-btn-download-document-docx span').css('background-position', "center center");
            leftMenuView.$el.find('#left-btn-download-document-docx span').css('background-size', "14px 14px");


            _mainController.api.asc_registerCallback('asc_onDownloadUrl', function(url)
            {
                if ( _state.isFromNuclearisDownloadAsDocx ) 
                {
                    var documentTitle = _mainController.api.asc_getDocumentName().toUpperCase();
                    var dataAtendimento = "";
                    if ( _mainController.editorConfig.macros && _mainController.editorConfig.macros['m;data_atendimento'] )
                    {
                        dataAtendimento = _mainController.editorConfig.macros['m;data_atendimento'].replaceAll("/", "_");
                        documentTitle = dataAtendimento + "_" + documentTitle;
                    }

                    if ( _mainController.editorConfig.patientName )
                    {
                        var patientName = _mainController.editorConfig.patientName;
                        documentTitle = patientName.replaceAll(" ", "_").toUpperCase() + "_" + documentTitle;
                    }

                    _mainController.api.nuclearis_documentRemoveWatermark("RASCUNHO");
                    
                    urltoFile(url, documentTitle).then(function(file){
                        
                        var reader = new FileReader();

                        reader.addEventListener("load", function () 
                        {
                            const anchor = document.createElement('a');
                            anchor.setAttribute('href', this.result);
                            anchor.setAttribute('download', file.name);
                            anchor.setAttribute('target', '_blank');
                            anchor.style.display = 'none';
                            document.body.appendChild(anchor);
                            anchor.click();
                            document.body.removeChild(anchor);
                        }, false);
                  
                        reader.readAsDataURL(file);
                    });
                }

                _state.isFromNuclearisDownloadAsDocx = false;
                leftMenuView.btnDownloadDocument.setDisabled(false); 
            });

            leftMenuView.btnDownloadDocument.on('click', function() 
            {
                if ( leftMenuView.btnDownloadDocument.isActive() )
                    leftMenuView.btnDownloadDocument.toggle(false);

                leftMenuView.btnDownloadDocument.setDisabled(true);   
                
                _mainController.api.nuclearis_documentInsertWatermark("RASCUNHO", true);

                _state.isFromNuclearisDownloadAsDocx = true;
                if (_mainController.api) _mainController.api.asc_DownloadAs(Asc.c_oAscFileType.DOCX, true);
            });
        };

        var configureDownloadDocumentAsPdfButton = function()
        {
            var leftMenuView = DE.getController('LeftMenu').getView('LeftMenu');
            leftMenuView.$el.find('.tool-menu-btns:last').append('<button id="left-btn-download-document-pdf" class="btn btn-category"><span class="btn-icon img-toolbarmenu" style="background-position: var(--bgX) -1401px">&nbsp;</span></button>');
            //statusbarView.$el.find('.tool-menu-btns:last').prepend('<div class="separator short el-edit"></div>');
            
            leftMenuView.btnDownloadDocumentPdf = new Common.UI.Button({
                el: $('#left-btn-download-document-pdf',leftMenuView.el),
                enableToggle: true,
                disabled: true,
                hint: "Realiza o download do documento em formato pdf (formato não editável)"
            });

            leftMenuView.$el.find('#left-btn-download-document-pdf span').css('background-image', "url('./resources/img/icon-pdf.png'");
            leftMenuView.$el.find('#left-btn-download-document-pdf span').css('background-position', "center center");
            leftMenuView.$el.find('#left-btn-download-document-pdf span').css('background-size', "14px 14px");

            _mainController.api.asc_registerCallback('asc_onDownloadUrl', function(url){
                if ( _state.isFromNuclearisDownloadAsPdf ) 
                {
                    var documentTitle = _mainController.api.asc_getDocumentName().toUpperCase();
                    
                    var dataAtendimento = "";
                    if ( _mainController.editorConfig.macros && _mainController.editorConfig.macros['m;data_atendimento'] )
                    {
                        dataAtendimento = _mainController.editorConfig.macros['m;data_atendimento'].replaceAll("/", "_");
                        documentTitle = dataAtendimento + "_" + documentTitle;
                    }
                    
                    if ( _mainController.editorConfig.patientName )
                    {
                        var patientName = _mainController.editorConfig.patientName;
                        documentTitle = patientName.replaceAll(" ", "_").toUpperCase() + "_" + documentTitle.replaceAll('DOCX', 'PDF');
                    }

                    _mainController.api.nuclearis_removeWatermark();
                    
                    urltoFile(url, documentTitle).then(function(file)
                    {
                        var reader = new FileReader();
                        reader.addEventListener("load", function () {
                            const anchor = document.createElement('a');
                            anchor.setAttribute('href', this.result);
                            anchor.setAttribute('download', file.name);
                            anchor.setAttribute('target', '_blank');
                            anchor.style.display = 'none';
                            document.body.appendChild(anchor);
                            anchor.click();
                            document.body.removeChild(anchor);
                        }, false);
                  
                        reader.readAsDataURL(file);
                    });
                }

                _state.isFromNuclearisDownloadAsPdf = false;
                leftMenuView.btnDownloadDocumentPdf.setDisabled(false); 
            });

            leftMenuView.btnDownloadDocumentPdf.on('click', function() 
            {
                if ( leftMenuView.btnDownloadDocumentPdf.isActive() )
                    leftMenuView.btnDownloadDocumentPdf.toggle(false);

                leftMenuView.btnDownloadDocumentPdf.setDisabled(true); 
                
                _mainController.api.nuclearis_addWatermark();

                _state.isFromNuclearisDownloadAsPdf = true;
                if (_mainController.api) _mainController.api.asc_DownloadAs(Asc.c_oAscFileType.PDF, true);
            });
        };

        var handleDocumentKeyUp = function(event)
        {
            if ( _mainController.api )
            {
                _mainController.api.nuclearis_searchShortcut(_buffer, _atalhos, _itensBuffer, _renderMenu, parseInt(Common.localStorage.getItem("de-settings-autocomplete-atalho")));
            }
        };

        var handleDocumentKeyDown = function(event)
        {
            if ( _mainController.api )
            {
                //var key = event.keyCode;

                if ( _atalhos == null )
                {
                    if ( _mainController && _mainController.editorConfig && _mainController.editorConfig.atalhos )
                    {
                        _atalhos = _mainController.editorConfig.atalhos;		
                    }
                } 

                _renderMenu = true;
                _itensBuffer = [];
                if ( _atalhoAutoCompleteMenu.isVisible() )
                {

                    //Bottom Arrow
                    if ( event.keyCode == Common.UI.Keys.DOWN )
                    {     
                        _mainController.api.nuclearis_emulateKeyDownApi(Common.UI.Keys.UP);
                        _atalhoAutoCompleteMenu.cmpEl.focus();
                        _.delay(function() {
                            _atalhoAutoCompleteMenu.items[0].cmpEl.find('a:first').focus();
                        }, 10);
                        _renderMenu = false;
                        return false;
                    }

                    //Top Arrow
                    if ( event.keyCode == Common.UI.Keys.UP )
                    {     
                        _mainController.api.nuclearis_emulateKeyDownApi(Common.UI.Keys.DOWN);
                        _atalhoAutoCompleteMenu.cmpEl.focus();
                        _.delay(function() {
                            var lastItem = _atalhoAutoCompleteMenu.items.length - 1;
                            _atalhoAutoCompleteMenu.items[lastItem].cmpEl.find('a:first').focus();
                        }, 10);
                        _renderMenu = false;
                        return false;
                    }
                }
            }
        };


        var showPopupMenu = function(documentHolderView, menu, value, event, docElement, eOpts)
        {
            if ( !_.isUndefined(menu)  && menu !== null )
            {
                Common.UI.Menu.Manager.hideAll();

                var showPoint = [event.X_abs, event.Y_abs],
                    menuContainer = $(documentHolderView.$el).find(Common.Utils.String.format('#menu-container-{0}', menu.id));

                if ( !menu.rendered ) 
                {
                    // Prepare menu container
                    if ( menuContainer.length < 1 ) 
                    {
                        menuContainer = $(Common.Utils.String.format('<div id="menu-container-{0}" style="position: absolute; z-index: 10000;"><div class="dropdown-toggle" data-toggle="dropdown"></div></div>', menu.id));
                        $(documentHolderView.$el).append(menuContainer);
                    }

                    menu.render(menuContainer);
                    menu.cmpEl.attr({tabindex: "-1"});
                }

                menuContainer.css({
                    left: showPoint[0],
                    top : showPoint[1]
                });

                menu.show();

                if ( _.isFunction(menu.options.initMenu) ) 
                {
                    menu.options.initMenu(value);
                    menu.alignPosition();
                }

                _.delay(function() {
                    //menu.cmpEl.focus();
                    if (menu.items.length == 1){
                        menu.items[0].cmpEl.addClass('over');
                        menu.items[0].cmpEl.find('a:first').focus();
                    }
                }, 10);

                documentHolderView.currentMenu = menu;
            }
        };

        var showShortcutsPopupMenu = function(itens)
        {
            var ConvertedPos = _mainController.api.nuclearis_convertCoordsToCursorWR();

            var menuData = {Type: 0, X_abs: ConvertedPos.X, Y_abs: ConvertedPos.Y};

            _atalhoAutoCompleteMenu.removeAll();
            for( var i = 0; i < itens.length ;i++ )
            {
                var menuItemAtalho = new Common.UI.MenuItem({
                    caption: Common.Utils.String.ellipsis(itens[i] + ' - ' + _atalhos[itens[i]], 80, true),
                    value: itens[i]
                });

                _atalhoAutoCompleteMenu.addItem(menuItemAtalho);
            }

            var application = _mainController.getApplication();
            var documentHolderView =  application.getController('DocumentHolder').getView('DocumentHolder');

            showPopupMenu(documentHolderView, _atalhoAutoCompleteMenu, {}, menuData, null, null);
        }

        Common.Gateway.on('init', onInit);

        Common.Gateway.on('internalcommand', onInternalCommand);

        $(document).on('keyup', handleDocumentKeyUp);

        $(document).on('keydown', handleDocumentKeyDown);

        var adicionarAtalhoDialog = function(item, e, eOpt)
        {
            var win;
            var application = _mainController.getApplication();
            var documentHolderView =  application.getController('DocumentHolder').getView('DocumentHolder');
            
            if ( _categoriasDeAtalho == null )
            {
                if ( _mainController && _mainController.editorConfig && _mainController.editorConfig.categoriasDeAtalho )
                {
                    _categoriasDeAtalho = _mainController.editorConfig.categoriasDeAtalho;		
                }
            }       
            
            if ( _mainController.api )
            {
                win = new DE.Views.AtalhoSettingsDialog({
                    api: _mainController.api,
                    handler: function(dlg, result) 
                    {
                        if ( result == 'ok' ) 
                        {
                            var _props = dlg.getSettings();
                            Common.Gateway.metaChange({type: 'adicionarAtalho',props:  _props});
                            _atalhos[_props.sigla] = _props.atalho_texto; 
                        }
                        documentHolderView.fireEvent('editcomplete', documentHolderView);
                    },
                    categoriasDeAtalho: _categoriasDeAtalho
                });                

                win.show();
                win.setSettings(item.menu_item_props.selectedText);
            }
        };

        var getMenuItemProps = function(selectedElements) 
        {
            if ( !selectedElements || !_.isArray(selectedElements) ) return;
            var menu_props = {};
            for ( var i = 0; i <selectedElements.length; i++ ) 
            {
                var elType = selectedElements[i].get_ObjectType();
                var elValue = selectedElements[i].get_ObjectValue();
                if ( Asc.c_oAscTypeSelectElement.Paragraph == elType )
                {
                    menu_props.paraProps = {};
                    menu_props.paraProps.value = elValue;
                    menu_props.paraProps.locked = (elValue) ? elValue.get_Locked() : false;
                    noobject = false;
                } 
                else if ( Asc.c_oAscTypeSelectElement.SpellCheck == elType ) 
                {
                    menu_props.spellProps = {};
                    menu_props.spellProps.value = elValue;
                    menu_props.hasSpellCheck = true;
                }
            }
            return menu_props;
        };

        var _getAtalhos = function() 
        {
            return _atalhos;
        };

        /*
        var startPluginConstrutorDeLaudo = function()
        {
            
            var plugin = window.g_asc_plugins.getPluginByGuid(_guidConstrutorDeLaudo);
            if ( !plugin )
                return;
            var isRunned = (window.g_asc_plugins.runnedPluginsMap[_guidConstrutorDeLaudo] !== undefined) ? true : false;	
            if ( !isRunned )
            {
                
                var pluginData = new window.Asc.CPluginData();
                
                window.g_asc_plugins.run(_guidConstrutorDeLaudo, 0, pluginData, true);
            }	
        }
        */
        
        String.prototype.replaceAll = function(search, replacement) 
        {
            var target = this;
            return target.replace(new RegExp(search, 'g'), replacement);
        };

        return {
            getAtalhos: _getAtalhos
        };
        
    })();
});