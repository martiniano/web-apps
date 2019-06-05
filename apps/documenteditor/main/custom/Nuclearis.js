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
        var _assinaturasPorLinha = 2;
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
            if(objData != null && objData.command == 'forceSave')
            {
                window.AscDesktopEditor_Save();
            }

            //Inserir Assinatura
            if(objData != null && objData.command == 'inserirAssinatura')
            {
                _signaturesBlock = objData.data;
                
                if(!_signaturesBlock.signatures){
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

                if(_signaturesBlock.redoSignatures){
                    _mainController.api.nuclearis_redoSignatures();
                }

                processNextSignature();
            }

            //getDocInfo
            if(objData != null && objData.command == 'getDocInfo')
            {
                window.g_asc_plugins.api.startGetDocInfo();
            }
        };

        var processNextSignature = function(){
            if(_signaturesBlock.signatures.length > 0){
                var signature = _signaturesBlock.signatures.shift();
                processaDadosAssinatura(signature);
            }else{
                // var config = {
                //     closable: false,
                //     title: "Sucesso",
                //     msg: "Área de assinaturas atualizada com sucesso!",
                //     iconCls: 'info',
                //     buttons: ['ok']
                // };
                
                // Common.UI.alert(config);

                _mainController.api.asc_Recalculate();

                _mainController.getApplication().getController('Statusbar').setStatusCaption("Área de assinaturas atualizada com sucesso!");
            }
        }

        var processaDadosAssinatura = function(signerBlock){
            if(signerBlock != null)
            {
                //Verifica se assintura tem imagem, se sim, carrega a imagem antes de inserir assinatura
                if(signerBlock.image && signerBlock.image !== null && signerBlock.image !== '')
                {
                    urltoFile(signerBlock.image, 'assinatura.png').then(function(file)
                    {
                        var Api             = window.g_asc_plugins.api;
                        var documentId      = Api.DocInfo.get_Id();
                        var documentUserId  = Api.DocInfo.get_UserId();
                        var jwt             = Api.CoAuthoringApi.get_jwt();

                        AscCommon.UploadImageFiles([file], documentId, documentUserId, jwt, function(error, urls)
                        {
                            if (Asc.c_oAscError.ID.No !== error)
                            {
                                Api.sendEvent("asc_onError", error, Asc.c_oAscError.Level.NoCritical);
                            }
                            else
                            {
                                signerBlock.image = urls[0];

                                if(Api.ImageLoader)
                                {
                                    var oApi = Api;
                                    Api.ImageLoader.LoadImagesWithCallback(urls, function()
                                    {
                                        var aImages = [];
                                        for(var i = 0; i < urls.length; ++i){
                                            var _image = oApi.ImageLoader.LoadImage(urls[i], 1);
                                            if(_image){
                                                aImages.push(_image);
                                            }
                                        }

                                        inserirAssinatura(signerBlock);
                                    }, []);
                                }
                            }
                        });
                    });
                }
                else
                {
                    inserirAssinatura(signerBlock);
                }
            }
        }

        //return a promise that resolves with a File instance
        var urltoFile = function(url, filename, mimeType){
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

        var inserirBlockAssinatura = function(Api, oParagraph, data)
        {
            //console.log(data);
            var extras = data.extras != null ? data.extras : [];
            var imageWidth = data.width != null ? data.width : 300;
            var imageHeight = data.height != null ? data.height : 200;
            
            if(data.image && data.image !== null && data.image !== ''){
                var oAssinatura = Api.CreateImage(data.image, imageWidth, imageHeight);
                oAssinatura.SetWrappingStyle('topAndBottom');
                oAssinatura.SetHorAlign("column", "center");
                oParagraph.AddDrawing(oAssinatura);
            }
            
            for(var i = 0; i < extras.length;i++){
                var oRun = Api.CreateRun();
                oRun.SetColor(0, 0, 0);
                oRun.AddText(extras[i]);
                if(i > 0){
                    oParagraph.AddLineBreak();
                }
                oParagraph.AddElement(oRun);
            }
                
            oParagraph.SetJc('center');
    
            return oParagraph;
        }

        var inserirAssinatura = function(data){
            var logicDocument =  _mainController.api.WordControl.m_oLogicDocument;
            var contentControls = _mainController.api.pluginMethod_GetAllContentControls();
            var pluginsApi = window.g_asc_plugins.api;

            logicDocument.Create_NewHistoryPoint(AscDFH.historydescription_Document_InsertDocumentsByUrls);

            if(_mainController && _mainController.editorConfig && _mainController.editorConfig.assinaturasPorLinha){
                _assinaturasPorLinha = _mainController.editorConfig.assinaturasPorLinha;		
            }else{
                _assinaturasPorLinha = 2;
            }

            var assinaturaContentControl = null;
            contentControls.forEach(function(control){
                if(control.Tag == 'ASSINATURAS'){   
                    assinaturaContentControl = logicDocument.GetContentControl(control.InternalId);
                }
            });

            //Não existe content control de Assinatura - vamos criar.
            if(assinaturaContentControl == null){
                var type = c_oAscSdtLevelType.Block; //Block
                
                var _content_control_pr = new AscCommon.CContentControlPr();
                _content_control_pr.Tag = "ASSINATURAS";
                _content_control_pr.Lock = 3;

                var _obj = pluginsApi.asc_AddContentControl(type, _content_control_pr);
                if (!_obj)
                    return undefined;

                //var _obj = Api.pluginMethod_AddContentControl(type, {"Lock" : 3});

                logicDocument.ClearContentControl(_obj.InternalId);

                //assinaturaContentControl = logicDocument.GetContentControl(_obj.InternalId);

                //assinaturaContentControl.Content.ClearContent();

                //var scriptAssinatura = createScriptBlockToReplace("ASSINATURAS2", "ASSINATURAS2", true, _obj.InternalId);

                //Api.pluginMethod_InsertAndReplaceContentControls([scriptAssinatura]);
                
                _mainController.api.nuclearis_redoSignatures();

                assinaturaContentControl = logicDocument.GetContentControl(_obj.InternalId);
            }       

            //var oDocument = _mainController.api.GetDocument();
            //oDocument.InsertWatermark("RASCUNHO", true);
            //oDocument.RemoveWatermark("RASCUNHO");

            var tableElement = assinaturaContentControl.Content.GetElement(0);
            var tableElementPos = null;
            for(var c = 0; c < assinaturaContentControl.Content.GetElementsCount(); c++){
                var element = assinaturaContentControl.Content.GetElement(c);
                if(element.GetType() == AscCommonWord.type_Table){
                    tableElement = element;
                    tableElementPos = c;
                    break;
                }
            }

            if(tableElementPos != null){
                assinaturaContentControl.Content.ClearContent();
                assinaturaContentControl.Content.AddContent([tableElement]);
            }

            //Se o primeiro elemento do content control de assinatura for um paragrafo troca para uma tabela
            /*
            if(firstElement.GetType() == AscCommonWord.type_Paragraph){
                apiOParagraph = Api.private_CreateApiParagraph(firstElement);
                apiOParagraph.RemoveAllElements();
                apiOParagraph.AddText("Hello world!");

                console.log(assinaturaContentControl);

                var oParagraph = assinaturaContentControl.Content.GetElement(0);
            }
            */

            if(tableElement != null && tableElement.GetType() == AscCommonWord.type_Table){
                
                //assinaturaContentControl.Content.Remove_FromContent(1, assinaturaContentControl.Content.GetElementsCount() - 1);

                var tblAssinaturas = tableElement;
                //Verificar se não nenhuma assinatura até o momento
                var pCell00 = tblAssinaturas.Get_Row(0).Get_Cell(0).GetContent(0).GetElement(0);
                if(pCell00.GetText().trim() == 'ASSINATURAS'){
                    var pCell00Api = pluginsApi.private_CreateApiParagraph(pCell00)
                    pCell00Api.RemoveAllElements();
                    inserirBlockAssinatura(pluginsApi, pCell00Api, data);
                }else{
                    //Já existe assinatura - adicionar nova coluna (célula) no final
                    var row = tblAssinaturas.Get_RowsCount() - 1;
                    var cell = tblAssinaturas.Get_Row(row).Get_CellsCount() - 1;

                    foundedCellEmpty = false;
                    //Procura por alguma célula vazia, se encontra coloca a assinatura nela;
                    for(var i = 0;i < tblAssinaturas.Get_RowsCount();i++){
                        for(var j = 0; j < tblAssinaturas.Get_Row(i).Get_CellsCount();j++){
                            var pCellIJ = tblAssinaturas.Get_Row(i).Get_Cell(j).GetContent(0).GetElement(0);
                            if(pCellIJ.GetAllDrawingObjects().length == 0 && pCellIJ.GetText().trim() == ""){
                                foundedCellEmpty = true;
                                row = i;
                                cell = j;
                                break;
                            }
                        }

                        if(foundedCellEmpty) break;
                    }

                    if(!foundedCellEmpty){
                        logicDocument.Start_SilentMode();
                        tblAssinaturas.private_RecalculateGrid();
                        tblAssinaturas.private_UpdateCellsGrid();

                        var newCell = null;
                        //Se já tiver n assinaturas em uma linha, adiciona uma nova linha abaixo
                        //console.log(_assinaturasPorLinha);
                        if(tblAssinaturas.Get_Row(row).Get_CellsCount() == _assinaturasPorLinha){
                            newCell = tblAssinaturas.Content[tblAssinaturas.Content.length - 1].Get_Cell(0);
                            tblAssinaturas.RemoveSelection();
                            tblAssinaturas.CurCell = newCell;
                            tblAssinaturas.AddTableRow(false);
                            row++;
                            cell = 0;
                        }else{
                            newCell = tblAssinaturas.Content[row].Get_Cell(tblAssinaturas.Content[row].Get_CellsCount() - 1);
                            tblAssinaturas.RemoveSelection();
                            tblAssinaturas.CurCell = newCell;
                            tblAssinaturas.AddTableColumn(false);
                            cell++;
                        }

                        logicDocument.End_SilentMode(false);
                    }

                    var lastCellEmpty = tblAssinaturas.Get_Row(row).Get_Cell(cell);

                    var pLastCellEmpty = lastCellEmpty.GetContent(0).GetElement(0);
                    var pLastCellEmptyApi = pluginsApi.private_CreateApiParagraph(pLastCellEmpty)
                    //pNewCellApi.RemoveAllElements();
                    inserirBlockAssinatura(pluginsApi, pLastCellEmptyApi, data);

                    tblAssinaturas.RecalculateAllTables();
                }
            } 

            logicDocument.Recalculate();
        
            
            //_mainController.api.pluginMethod_InsertAndReplaceContentControls([scriptAssinatura]);

            processNextSignature();
        }

        var createScriptBlockToReplace =  function(Tag, Label, isTextField, InternalId)
        {		
            if(Tag != 'ASSINATURAS'){
                var _script = "\r\n\
                    var oDocument = Api.GetDocument();\r\n\
                    var oParagraph = Api.CreateParagraph();\r\n\
                    var oRun = oParagraph.AddText(\'" + Label + "\');\r\n\
                    oRun.SetColor(255,255,255);\r\n\
                    oRun.SetShd(\"clear\"," + (isTextField ? "0, 0, 255" : "255, 0, 0" ) + ");\r\n\
                    oDocument.InsertContent([oParagraph], true);\r\n\
                    ";
            }else{
                var _script = "\r\n\
                    var oDocument = Api.GetDocument();\r\n\
                    var tblAssinatura = Api.CreateTable(1, 1);\r\n\
                    tblAssinatura.SetWidth('percent', 100);\r\n\
                    var pCell00 = tblAssinatura.GetRow(0).GetCell(0).GetContent().GetElement(0);\r\n\
                    pCell00.SetJc('center');\r\n\
                    var oRun = pCell00.AddText(\'" + Label + "\');\r\n\
                    oRun.SetColor(255,255,255);\r\n\
                    oRun.SetShd(\"clear\"," + (isTextField ? "0, 0, 255" : "255, 0, 0" ) + ");\r\n\
                    oDocument.InsertContent([tblAssinatura], true);\r\n\
                    ";
            }
            _script = _script.replaceAll("\r\n", "");
            _script = _script.replaceAll("\n", "");
            
            var _scriptObject = {
                "Props" : {
                    "Tag"        : Tag,
                    "Lock"       : 3,
                    "InternalId" : InternalId
                },
                "Script" : _script
            };
            
            return _scriptObject;
        }

        var onInit = function(loadConfig) {
        
            //console.log(loadConfig);
            var currentValueAutocompleteAtalho = Common.localStorage.getItem("de-settings-autocomplete-atalho");
            if(currentValueAutocompleteAtalho === null){
                currentValueAutocompleteAtalho = 0;
                Common.localStorage.setItem("de-settings-autocomplete-atalho", currentValueAutocompleteAtalho);
            }

            if(_mainController == null){
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

            _mainController.api.asc_registerCallback('asc_onContextMenu', function(){
                
                var selectedElements =  _mainController.api.getSelectedElements();
                var menu_item_props = getMenuItemProps(selectedElements);

                menuAddShortcutPara.menu_item_props = menu_item_props;

                menuAddShortcutPara.menu_item_props.selectedText = _mainController.api.WordControl.m_oLogicDocument.GetSelectedText(true);

                if(menu_item_props.hasSpellCheck && !menu_item_props.spellProps.value.Checked){
                    documentHolderView.textMenu.insertItem(-1, menuAddShortcutPara);
                }else{
                    documentHolderView.textMenu.insertItem(0, menuAddShortcutPara);
                } 
            });

            _atalhoAutoCompleteMenu = new Common.UI.Menu({
                items: [ ]
            }).on('item:click', function (menu, item, e) {
                replaceAtalho(item.value, _atalhos[item.value]);
            });

            if(_mainController && _mainController.editorConfig && _mainController.editorConfig.atalhos){
                _atalhos = _mainController.editorConfig.atalhos;		
            }

            //Habilita plugin construtor de laudo ao se fechar qualquer outro plugin
            if(!_mainController.api.asc_checkNeedCallback('asc_onPluginClose')){
                _mainController.api.asc_registerCallback('asc_onPluginClose', function(plugin){
                    if(plugin.guid !== _guidConstrutorDeLaudo){					
                        startPluginConstrutorDeLaudo();
                    }
                });
            }

            if(!_mainController.api.asc_checkNeedCallback('asc_onPluginShow')){
                _mainController.api.asc_registerCallback('asc_onPluginShow', function(plugin){
                    if(plugin.guid === _guidNuclearisMacros){					
                        var _plugin = window.g_asc_plugins.runnedPluginsMap[_guidNuclearisMacros];
                        if (!_plugin)
                            return;

                        _plugin.startData.setAttribute("macros", _mainController.editorConfig.macros);
                        _plugin.startData.setAttribute("macrosDeQuestionario", _mainController.editorConfig.macrosDeQuestionario);
                    }
                });
            }

            //Estatisticas
            _mainController.api.asc_registerCallback('asc_onDocInfo', function(obj){
                if (obj) {
                    if (obj.get_PageCount() > -1)
                        _infoObj.PageCount = obj.get_PageCount();
                    if (obj.get_WordsCount() > -1)
                        _infoObj.WordsCount = obj.get_WordsCount();
                    if (obj.get_ParagraphCount() > -1)
                        _infoObj.ParagraphCount = obj.get_ParagraphCount();
                    if (obj.get_SymbolsCount() > -1)
                        _infoObj.SymbolsCount = obj.get_SymbolsCount();
                    if (obj.get_SymbolsWSCount() > -1)
                        _infoObj.SymbolsWSCount = obj.get_SymbolsWSCount();
                }
            });

            _mainController.api.asc_registerCallback('asc_onGetDocInfoEnd', function(){
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

            btnCompleteAtalho.on('click', function() {
                var value = Common.localStorage.getItem("de-settings-autocomplete-atalho");;
                value = 1 - value;
                Common.localStorage.setItem("de-settings-autocomplete-atalho", value);
                btnCompleteAtalho.toggle(value===null || parseInt(value) == 1, true);
            });
            
            if(loadConfig.config.mode == "edit"){
                configureDownloadDocumentAsDocxButton();
                configureDownloadDocumentAsPdfButton();
                
                _mainController.api.asc_registerCallback('asc_onDocumentContentReady', function(){
                    _mainController.api.nuclearis_registerCallbacks();
                });
            }
        };      

        var configureDownloadDocumentAsDocxButton = function(){
            var leftMenuView = DE.getController('LeftMenu').getView('LeftMenu');
            leftMenuView.$el.find('.tool-menu-btns:last').append('<button id="left-btn-download-document-docx" class="btn btn-category"><span class="btn-icon img-toolbarmenu" style="background-position: var(--bgX) -1401px">&nbsp;</span></button>');
            //statusbarView.$el.find('.tool-menu-btns:last').prepend('<div class="separator short el-edit"></div>');
            
            var btnDownloadDocument = new Common.UI.Button({
                el: $('#left-btn-download-document-docx',leftMenuView.el),
                enableToggle: true,
                hint: "Realiza o download do documento em formato docx (compativel com o Microsoft Word)"
            });

            leftMenuView.$el.find('#left-btn-download-document-docx span').css('background-image', "url('./resources/img/ms-word.png'");
            leftMenuView.$el.find('#left-btn-download-document-docx span').css('background-position', "center center");
            leftMenuView.$el.find('#left-btn-download-document-docx span').css('background-size', "14px 14px");


            _mainController.api.asc_registerCallback('asc_onDownloadUrl', function(url){
                if (_state.isFromNuclearisDownloadAsDocx) {
                    var documentTitle = _mainController.api.documentTitle.toUpperCase();
                    var dataAtendimento = "";
                    if( _mainController.editorConfig.macros && _mainController.editorConfig.macros['m;data_atendimento']){
                        dataAtendimento = _mainController.editorConfig.macros['m;data_atendimento'].replaceAll("/", "_");
                        documentTitle = dataAtendimento + "_" + documentTitle;
                    }

                    if(_mainController.editorConfig.patientName){
                        var patientName = _mainController.editorConfig.patientName;
                        documentTitle = patientName.replaceAll(" ", "_").toUpperCase() + "_" + documentTitle;
                    }

                    var oDocument = _mainController.api.GetDocument();
                    oDocument.RemoveWatermark("RASCUNHO");
                    
                    urltoFile(url, documentTitle).then(function(file){
                        
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
                _state.isFromNuclearisDownloadAsDocx = false;
                btnDownloadDocument.setDisabled(false); 
            });

            btnDownloadDocument.on('click', function() {
                if (btnDownloadDocument.isActive())
                    btnDownloadDocument.toggle(false);

                btnDownloadDocument.setDisabled(true);   
                
                var oDocument = _mainController.api.GetDocument();
                oDocument.InsertWatermark("RASCUNHO", true);
                _mainController.api.asc_Recalculate();

                _state.isFromNuclearisDownloadAsDocx = true;
                if (_mainController.api) _mainController.api.asc_DownloadAs(Asc.c_oAscFileType.DOCX, true);
            });
        };

        var configureDownloadDocumentAsPdfButton = function(){
            var leftMenuView = DE.getController('LeftMenu').getView('LeftMenu');
            leftMenuView.$el.find('.tool-menu-btns:last').append('<button id="left-btn-download-document-pdf" class="btn btn-category"><span class="btn-icon img-toolbarmenu" style="background-position: var(--bgX) -1401px">&nbsp;</span></button>');
            //statusbarView.$el.find('.tool-menu-btns:last').prepend('<div class="separator short el-edit"></div>');
            
            var btnDownloadDocumentPdf = new Common.UI.Button({
                el: $('#left-btn-download-document-pdf',leftMenuView.el),
                enableToggle: true,
                hint: "Realiza o download do documento em formato pdf (formato não editável)"
            });

            leftMenuView.$el.find('#left-btn-download-document-pdf span').css('background-image', "url('./resources/img/icon-pdf.png'");
            leftMenuView.$el.find('#left-btn-download-document-pdf span').css('background-position', "center center");
            leftMenuView.$el.find('#left-btn-download-document-pdf span').css('background-size', "14px 14px");

            _mainController.api.asc_registerCallback('asc_onDownloadUrl', function(url){
                if (_state.isFromNuclearisDownloadAsPdf) {
                    var documentTitle = _mainController.api.documentTitle.toUpperCase();
                    
                    var dataAtendimento = "";
                    if( _mainController.editorConfig.macros && _mainController.editorConfig.macros['m;data_atendimento']){
                        dataAtendimento = _mainController.editorConfig.macros['m;data_atendimento'].replaceAll("/", "_");
                        documentTitle = dataAtendimento + "_" + documentTitle;
                    }
                    
                    if(_mainController.editorConfig.patientName){
                        var patientName = _mainController.editorConfig.patientName;
                        documentTitle = patientName.replaceAll(" ", "_").toUpperCase() + "_" + documentTitle.replaceAll('DOCX', 'PDF');
                    }

                    _mainController.api.nuclearis_removeWatermark();
                    
                    urltoFile(url, documentTitle).then(function(file){
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
                btnDownloadDocumentPdf.setDisabled(false); 
            });

            btnDownloadDocumentPdf.on('click', function() {
                if (btnDownloadDocumentPdf.isActive())
                    btnDownloadDocumentPdf.toggle(false);

                btnDownloadDocumentPdf.setDisabled(true); 
                
                _mainController.api.nuclearis_addWatermark();

                _state.isFromNuclearisDownloadAsPdf = true;
                if (_mainController.api) _mainController.api.asc_DownloadAs(Asc.c_oAscFileType.PDF, true);
            });
        };

        var handleDocumentKeyUp = function(event){
            if (_mainController.api){
                searchAtalho(event);
            }
        };

        var handleDocumentKeyDown = function(event){
            if (_mainController.api){
                //var key = event.keyCode;

                if(_atalhos == null){
                    if(_mainController && _mainController.editorConfig && _mainController.editorConfig.atalhos){
                        _atalhos = _mainController.editorConfig.atalhos;		
                    }
                } 

                _renderMenu = true;
                _itensBuffer = [];
                if(_atalhoAutoCompleteMenu.isVisible()){

                    //Bottom Arrow
                    if(event.keyCode == Common.UI.Keys.DOWN){     
                        AscCommon.g_inputContext.emulateKeyDownApi(Common.UI.Keys.UP);
                        _atalhoAutoCompleteMenu.cmpEl.focus();
                        _.delay(function() {
                            _atalhoAutoCompleteMenu.items[0].cmpEl.find('a:first').focus();
                        }, 10);
                        _renderMenu = false;
                        return false;
                    }

                    //Top Arrow
                    if(event.keyCode == Common.UI.Keys.UP){     
                        AscCommon.g_inputContext.emulateKeyDownApi(Common.UI.Keys.DOWN);
                        _atalhoAutoCompleteMenu.cmpEl.focus();
                        _.delay(function() {
                            var lastItem = _atalhoAutoCompleteMenu.items.length - 1;
                            _atalhoAutoCompleteMenu.items[lastItem].cmpEl.find('a:first').focus();
                        }, 10);
                        _renderMenu = false;
                        return false;
                    }

                    /*
                    //Esc
                    if(event.keyCode == Common.UI.Keys.ESC){
                        _atalhoAutoCompleteMenu.hide();
                        _renderMenu = false;
                        _itensBuffer = [];
                        console.log('Limpando buffer', _itensBuffer);
                    }

                    //Enter
                    if(event.keyCode == Common.UI.Keys.RETURN){
                        _atalhoAutoCompleteMenu.hide();
                        _renderMenu = false;
                        _itensBuffer = [];
                    }
                    */
                }
            }
        };


        var showPopupMenu = function(documentHolderView, menu, value, event, docElement, eOpts){
            if (!_.isUndefined(menu)  && menu !== null){
                Common.UI.Menu.Manager.hideAll();

                var showPoint = [event.X_abs, event.Y_abs],
                    menuContainer = $(documentHolderView.$el).find(Common.Utils.String.format('#menu-container-{0}', menu.id));

                if (!menu.rendered) {
                    // Prepare menu container
                    if (menuContainer.length < 1) {
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

                if (_.isFunction(menu.options.initMenu)) {
                    menu.options.initMenu(value);
                    menu.alignPosition();
                }

                _.delay(function() {
                    //menu.cmpEl.focus();
                    if(menu.items.length == 1){
                        menu.items[0].cmpEl.addClass('over');
                        menu.items[0].cmpEl.find('a:first').focus();
                    }
                }, 10);

                /*
                menu.items.forEach(function(item){
                    var modalParents = item.cmpEl.closest("div[id^='menu-container-asc']");

                    item.cmpEl.tooltip({
                        title       : _atalhos[item.value],
                        placement   : 'bottom-left'
                    });

                    if (modalParents.length > 0) {
                        item.cmpEl.data('bs.tooltip').tip().css('z-index', parseInt(modalParents.css('z-index')) + 10);
                    }
                });
                */

                documentHolderView.currentMenu = menu;
            }
        };

        var exibirMenuPopupAtalhos = function(itens){
            var curPosXY = _mainController.api.WordControl.m_oLogicDocument.GetCurPosXY();
            var PageIndex = _mainController.api.WordControl.m_oLogicDocument.Controller.GetCurPage();
            var ConvertedPos = _mainController.api.WordControl.m_oDrawingDocument.ConvertCoordsToCursorWR(curPosXY.X, curPosXY.Y, PageIndex);
            
            var menuData = {Type: 0, X_abs: ConvertedPos.X, Y_abs: ConvertedPos.Y};

            _atalhoAutoCompleteMenu.removeAll();
            for(var i = 0; i < itens.length ;i++){
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

        var searchAtalho = function(e)
        {
            if (_renderMenu && _mainController.api){
                
                var Doc    = _mainController.api.WordControl.m_oLogicDocument;
        
                var paraRun = Doc.Get_DocumentPositionInfoForCollaborative();

                var currentValueAutocompleteAtalho = parseInt(Common.localStorage.getItem("de-settings-autocomplete-atalho"));

                //var oRunText = new CParagraphGetText();
                //paraRun.Class.Get_Text(oRunText);
        
                if(paraRun != null && paraRun.Class.Content && paraRun.Position >= 1){
                    var pos = paraRun.Position - 1;

                    if(paraRun.Class.Content[pos].Type == AscCommonWord.ParaSpace.prototype.Get_Type()){
                        if(currentValueAutocompleteAtalho === 0){
                            if(_atalhos[_buffer.text] !== undefined){
                                replaceAtalho(_buffer.text, _atalhos[_buffer.text]);
                            }
                        }  
                        _buffer.startPos = null;
                        _buffer.endPos = null;  
                        _buffer.text = '';          
                    }else{ 
                        _buffer.endPos = pos;
                        _buffer.text = '';
                        while(pos >= 0 && paraRun.Class.Content[pos].Type != null && paraRun.Class.Content[pos].Type == AscCommonWord.ParaText.prototype.Get_Type()){
                            _buffer.text = String.fromCharCode(paraRun.Class.Content[pos].Value) + _buffer.text;
                            _buffer.startPos = pos;
                            pos--;
                        }

                        if(_buffer.text.length > 1){
                            var itens = [];
                            for (var key in _atalhos) {
                                if (key.startsWith(_buffer.text)) {
                                    itens.push(key);
                                }
                            }

                            if(itens.length > 0){
                                if(!_.isEqual(itens, _itensBuffer)){
                                    _itensBuffer = itens;
                                    if(currentValueAutocompleteAtalho === 1){
                                        exibirMenuPopupAtalhos(itens);           
                                    }                         
                                }
                            }else{
                                if(_atalhoAutoCompleteMenu.isVisible()){
                                    _atalhoAutoCompleteMenu.hide();
                                    _itensBuffer = [];
                                }
                            }
                        }
                    }
                }
            }
        };

        var replaceAtalho = function(atalho, atalho_value){
            if (_mainController.api){                
                var Doc    = _mainController.api.WordControl.m_oLogicDocument;
                var paraRun = Doc.Get_DocumentPositionInfoForCollaborative();

                if(_buffer.startPos < paraRun.Position && _buffer.endPos < paraRun.Position){
                    paraRun.Class.Selection.Use   = true;
                    paraRun.Class.Selection.Start = false;
                    paraRun.Class.Selection.Flag  = AscCommon.selectionflag_Common;
            
                    paraRun.Class.Selection.StartPos = _buffer.startPos;
                    paraRun.Class.Selection.EndPos   = _buffer.endPos;

                    //var selectedText = Doc.GetSelectedText();
                    
                    paraRun.Class.Remove_FromContent(_buffer.startPos, atalho.length, true);
                    paraRun.Class.AddText(atalho_value, _buffer.startPos);
                    paraRun.Class.Paragraph.Document_SetThisElementCurrent(true);
                    paraRun.Class.MoveCursorToEndPos(false);
                    paraRun.Class.State.ContentPos = (_buffer.startPos + atalho_value.length + 1);

                    paraRun.Class.RemoveSelection();

                    _mainController.api.WordControl.m_oLogicDocument.Recalculate();

                    _itensBuffer = [];
                }
            }
        };

        Common.Gateway.on('init', onInit);

        Common.Gateway.on('internalcommand', onInternalCommand);

        $(document).on('keyup', handleDocumentKeyUp);

        $(document).on('keydown', handleDocumentKeyDown);

        var adicionarAtalhoDialog = function(item, e, eOpt){
            var win;
            var application = _mainController.getApplication();
            var documentHolderView =  application.getController('DocumentHolder').getView('DocumentHolder');
            
            if(_categoriasDeAtalho == null){
                if(_mainController && _mainController.editorConfig && _mainController.editorConfig.categoriasDeAtalho){
                    _categoriasDeAtalho = _mainController.editorConfig.categoriasDeAtalho;		
                }
            }       
            
            if (_mainController.api){
                win = new DE.Views.AtalhoSettingsDialog({
                    api: _mainController.api,
                    handler: function(dlg, result) {
                        if (result == 'ok') {
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

        var getMenuItemProps = function(selectedElements) {
            if (!selectedElements || !_.isArray(selectedElements)) return;
            var menu_props = {};
            for (var i = 0; i <selectedElements.length; i++) {
                var elType = selectedElements[i].get_ObjectType();
                var elValue = selectedElements[i].get_ObjectValue();
                if (Asc.c_oAscTypeSelectElement.Paragraph == elType)
                {
                    menu_props.paraProps = {};
                    menu_props.paraProps.value = elValue;
                    menu_props.paraProps.locked = (elValue) ? elValue.get_Locked() : false;
                    noobject = false;
                } else if (Asc.c_oAscTypeSelectElement.SpellCheck == elType) {
                    menu_props.spellProps = {};
                    menu_props.spellProps.value = elValue;
                    menu_props.hasSpellCheck = true;
                }
            }
            return menu_props;
        };

        var _getAtalhos = function() {
            return _atalhos;
        };

        var startPluginConstrutorDeLaudo = function(){
            var plugin = window.g_asc_plugins.getPluginByGuid(_guidConstrutorDeLaudo);
            if (!plugin)
                return;
            var isRunned = (window.g_asc_plugins.runnedPluginsMap[_guidConstrutorDeLaudo] !== undefined) ? true : false;	
            if(!isRunned){
                
                var pluginData = new window.Asc.CPluginData();
                
                /*
			    if(mainController && mainController.editorConfig && mainController.editorConfig.macros){
                    pluginData.setAttribute("macros", mainController.editorConfig.macros);
                }
                
                if(mainController && mainController.editorConfig && typeof(mainController.editorConfig.laudoEstruturado) !== 'undefined') {
                    pluginData.setAttribute("laudoEstruturado", mainController.editorConfig.laudoEstruturado);
                }
                */
                
                window.g_asc_plugins.run(_guidConstrutorDeLaudo, 0, pluginData, true);
            }	
        }
        
        String.prototype.replaceAll = function(search, replacement) {
            var target = this;
            return target.replace(new RegExp(search, 'g'), replacement);
        };

        /*
        var _refresh = function() {
            if (!_lsAllowed)
                Common.Gateway.internalMessage('localstorage', {cmd:'get', keys:_filter});
        };

        var _save = function() {
            if (!_lsAllowed)
                Common.Gateway.internalMessage('localstorage', {cmd:'set', keys:_store});
        };

        var _setItem = function(name, value, just) {
            if (_lsAllowed) {
                try
                {
                    localStorage.setItem(name, value);
                }
                catch (error){}

            } else {
                _store[name] = value;

                if (just===true) {
                    Common.Gateway.internalMessage('localstorage', {
                        cmd:'set',
                        keys: {
                            name: value
                        }
                    });
                }
            }
        };

        try {
            var _lsAllowed = !!window.localStorage;
        } catch (e) {
            _lsAllowed = false;
        }
            */
        return {
            getAtalhos: _getAtalhos
        };
        
    })();
});