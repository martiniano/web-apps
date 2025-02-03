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
], function ($, _, Backbone, gateway) {
  Common.Nuclearis = new (function () {
    var _mainController = null;
    var _infoObj = {
      PageCount: 0,
      WordsCount: 0,
      ParagraphCount: 0,
      SymbolsCount: 0,
      SymbolsWSCount: 0
    };
    var _signaturesBlock = null;

    var onInternalCommand = function (objData) {
      //Force Save
      if (objData != null && objData.command == "forceSave") {
        _mainController.api.asc_Save(false, false, false);
      }

      //Inserir Assinatura
      if (objData != null && (objData.command == "inserirAssinatura" || objData.command == "insertSignature")) {
        _signaturesBlock = objData.data;

        if (!_signaturesBlock.signatures) {
          //Não tem campo signatures, está no padrão antigo, ajustar
          _signaturesBlock = {
            redoSignatures: false,
            signatures: [
              {
                width: objData.data.width,
                height: objData.data.height,
                image: objData.data.imagem,
                complement: objData.data.complement,
                format: objData.data.format
              }
            ]
          }
        }

        if (_signaturesBlock.redoSignatures) {
          _mainController.api.nuclearis_redoSignatures();
        }

        processNextSignature();
      }

      //getDocInfo
      if (objData != null && objData.command == "getDocInfo") {
        _mainController.api.startGetDocInfo();
      }

      if (objData != null && objData.command == "insertMeasurementHyperlink") {
        insertMeasurementHyperlink(objData.data);
      }

      if (objData != null && objData.command == "removeMeasurementHyperlink") {
        _mainController.api.nuclearis_removeMeasurementHyperlink(objData.data);
      }

      if (objData != null && objData.command == "replaceContentControls") {
        var items = {};

        if (objData.data && objData.data.IMAGE_MAP) {

          var promises = [];
          var imageMapKeys = Object.keys(objData.data.IMAGE_MAP);
          for (var i = 0; i < imageMapKeys.length; i++) {
            var imageMapKey = imageMapKeys[i];
            promises.push(urltoFile(objData.data.IMAGE_MAP[imageMapKey], imageMapKey + '.png'));
          }

          Promise.all(promises).then(function (files) {
            _mainController.api.nuclearis_uploadImageFiles(files, function (images) {

              delete objData.data.IMAGE_MAP;
              var sectionKeys = Object.keys(objData.data);
              for (var i = 0; i < images.length; i++) {
                for (var j = 0; j < sectionKeys.length; j++) {
                  var sectionKey = sectionKeys[j];
                  var section = objData.data[sectionKey];
                  section = section.replace(imageMapKeys[i], images[i]);
                  objData.data[sectionKey] = section;
                }
              }

              Object.assign(items, _mainController.editorConfig.macros, objData.data);
              _mainController.api.nuclearis_replaceContentControls(items);
            });
          });


        } else {
          Object.assign(items, _mainController.editorConfig.macros, objData.data);
          _mainController.api.nuclearis_replaceContentControls(items);
        }
      }

      if (objData != null && objData.command == "uploadAndInsertImage") {
        uploadAndInsertImage(objData.data.image, objData.data.width, objData.data.height, objData.data.wrappingStyle);
      }

    };

    var insertMeasurementHyperlink = function (hyperlink) {
      var props, text;

      if (hyperlink && _mainController.api) {

        props = new Asc.CHyperlinkProperty(),
          url = $.trim(hyperlink.url);

        if (! /(((^https?)|(^measurement)):\/\/)|(^mailto:)/i.test(url))
          url = 'measurement://' + url;

        url = url.replace(new RegExp("%20", 'g'), " ");

        text = _mainController.api.can_AddHyperlink();

        if (text !== false) {
          props.put_Value(url);
          props.put_Text(hyperlink.text);
          props.put_ToolTip(hyperlink.tooltip);

          if (!_.isEmpty($.trim(text))) {
            props.put_Text(text);
          }

          _mainController.api.add_Hyperlink(props);
        }
        else {
          var selectedElements = _mainController.api.getSelectedElements();
          if (selectedElements && _.isArray(selectedElements)) {
            _.each(selectedElements, function (el, i) {
              if (selectedElements[i].get_ObjectType() == Asc.c_oAscTypeSelectElement.Hyperlink)
                props = selectedElements[i].get_ObjectValue();
            });
          }

          if (props) {
            props.put_Value(url);
            props.put_ToolTip(hyperlink.tooltip);
            _mainController.api.change_Hyperlink(props);
          }
        }
      }
    }

    var generateRandomName = function () {
      return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    var uploadAndInsertImage = function (base64Image, width, height, wrappingStyle) {
      if (!_.isEmpty(base64Image)) {
        var imagemName = generateRandomName() + '.png';
        urltoFile(base64Image, imagemName).then(function (file) {
          _mainController.api.nuclearis_uploadAndInsertImage(file, width, height, wrappingStyle, function () {
            Common.Gateway.internalMessage('imageUploaded', imagemName);
          });
        });
      }
    }

    var processNextSignature = function () {
      if (_signaturesBlock.signatures.length > 0) {
        var signature = _signaturesBlock.signatures.shift();
        processSignatureBlock(signature);
      }
      else {
        _mainController.api.nuclearis_recalculate();

        _mainController.getApplication().getController('Statusbar').setStatusCaption("Área de assinaturas atualizada com sucesso!");
      }
    }

    var processSignatureBlock = function (signerBlock) {
      var signaturesPerLine = 2;
      if (_mainController && _mainController.editorConfig && _mainController.editorConfig.signaturesPerLine) {
        signaturesPerLine = _mainController.editorConfig.signaturesPerLine;
      }

      if (signerBlock != null) {
        //Verifica se assinatura tem imagem, se sim, carrega a imagem antes de inserir assinatura
        if (signerBlock.image && signerBlock.image !== null && signerBlock.image !== '') {
          urltoFile(signerBlock.image, generateRandomName() + '.png').then(function (file) {
            _mainController.api.nuclearis_uploadAndInsertSignatureImage(file, function (image_url) {
              signerBlock.image = image_url;
              _mainController.api.nuclearis_insertSignature(signerBlock, signaturesPerLine);
              processNextSignature();
            });
          });
        }
        else {
          _mainController.api.nuclearis_insertSignature(signerBlock, signaturesPerLine);
          processNextSignature();
        }
      }
    }

    //return a promise that resolves with a File instance
    var urltoFile = function (url, filename, mimeType) {
      mimeType = mimeType || (url.match(/^data:([^;]+);/) || '')[1];
      return (fetch(url)
        .then(function (res) {
          return res.arrayBuffer();
        })
        .then(function (buf) {
          return new File([buf], filename, { type: mimeType });
        })
        .catch(function (err) {
          console.log(err);
        })
      );
    }

    var onInit = function (loadConfig) {
      if (_mainController == null && DE.getController('Main') != null) {
        _mainController = DE.getController('Main');
      } else {
        //Do nothing
        return;
      }

      //Estatísticas
      _mainController.api.asc_registerCallback('asc_onDocInfo', function (obj) {
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

      _mainController.api.asc_registerCallback('asc_onGetDocInfoEnd', function () {
        Common.Gateway.metaChange({ type: 'docInfo', info: _infoObj });
      });
      
      if (loadConfig.config.mode == "edit") {
        _mainController.api.asc_registerCallback('asc_onDocumentContentReady', function () {
          _mainController.api.nuclearis_registerCallbacks();
        });
      }

      _mainController.api.asc_registerCallback('asc_onHyperlinkClick', function (url) {
        if (url) {
          if (url.startsWith("measurement://")) {
            Common.Gateway.internalMessage('showMeasurement', url.replace("measurement://", ""));
          }
          else {
            window.open(url);
          }
        }
      });
    };
    
    Common.Gateway.on('init', onInit);

    Common.Gateway.on('internalcommand', onInternalCommand);

    String.prototype.replaceAll = function (search, replacement) {
      var target = this;
      return target.replace(new RegExp(search, 'g'), replacement);
    };

    return {};

  })();
});
