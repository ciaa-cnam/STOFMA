"use strict";

var q = require('q');

/**
 * SaleController
 *
 * @description :: Server-side logic for managing Sales
 */

module.exports = {

  /**
  * Constructs a new Sale
  * @param req
  * @param req.param                                     {Object}    Match criteria
  * @param [req.param.saleDate = Current date]           {Date}      Date of the Sale creation
  * @param [req.param.managerId = Current session's id]  {Number}    Id of the manager User
  * @param req.param.customerId                          {Number}    Id of the customer User
  * @param req.param.products                            {Array}     Array of productId-quantity pairs defined as follows [{productId: <Number>, quantity: <Number>}, ...]
  * @param res
  */
  add: function (req, res) {

    // TODO Verify parameters

    //create the pairs
    createPairs(req.param('products'))
    .then(function(pairs) {

      //get the customer
      User.findOne(req.param('customerId'), function(err, customer){

        //get his credit
        var totalPrice = 0;
        for (var i = 0; i < pairs.length; i++) {
          totalPrice += pairs[i].unitPrice * pairs[i].quantity;
        }

        //check if he has enough credit
        if(customer.credit < totalPrice) {

          //destroy the new pairs if he hasn't
          for (var i = 0; i < pairs.length; i++) {
            Pair.destroy(pairs[i]);
          }
          return res.send(406, "You don't have enough credit.");
        }
        else {
          //create the Sale
          Sale.create({
            saleDate: req.param('saleDate') || new Date(),
            customer: req.param('customerId'),
            manager:  req.param('managerId') || req.session.user.id,
            products: pairs
          }, function (err, newSale) {

            if (err) {
              return res.negotiate(err);
            }
            else {
              
              //update the user's credit
              customer.credit -= newSale.totalPrice;
              customer.save();
              return res.send(200, newSale);
            }
          });
        }
      });
    })
    .catch(res.negotiate);
  },

  /**
  * Delete Sales
  * @param req
  * @param req.param {Object} Match criteria
  * @param res
  */
  delete: function (req, res) {
    Sale
    .destroy(req.allParams())
    .exec(function(err, deletedSale) {
      if (err) {
        return res.negotiate(err);
      }
      else {
        return res.send(200);
      }
    });
  },

  /**
  * Get Sales
  * @note If the lazy mode is set to on (req.session.lazy), all associations are populated. This might result in heavy api calls.
  * @param req
  * @param req.param {Object} Waterline criteria
  * @param res
  */
  get: function (req, res) {

    if(req.session.lazy) { // Populate everything
      Sale
      .find(req.allParams())
      .populate('manager')
      .populate('customer')
      .populate('products')
      .exec(function(err, foundSales) {
        if (err) {
          return res.negotiate(err);
        }
        else {
          async.each(foundSales, function(sale, next) {
            async.each(sale.products, function(pair, next) {
              Product
              .findOne(pair.product)
              .exec(function(err, foundProduct) {
                if(err) {
                  next(err);
                }
                else {
                  pair.product = foundProduct;
                  next();
                }
              });
            }, next);
          }, function(err) {
            if(err) {
              res.negociate(err);
            }
            else {
              res.send(foundSales);
            }
          });
        }
      });
    }
    else { // Return the Sales un-populated
      Sale
      .find(req.allParams())
      .exec(function(err, foundSales) {
        if (err) {
          return res.negotiate(err);
        }
        else {
          return res.send(foundSales);
        }
      });
    }
  },

  /**
   * Update Sale
   * @param req
   * @param req.param
   * @param req.param.saleId
   * @param res
   */
  update: function(req, res) {

    // TODO Verify parameters

    var updatedValues = {};
    if(req.param('saleDate')) updatedValues.saleDate = req.param('saleDate');
    if(req.param('customerId')) updatedValues.customer = req.param('customerId');
    if(req.param('managerId')) updatedValues.manager = req.param('managerId');

    if(req.param('saleDate'))
      updatedValues.saleDate = req.param('saleDate');
    else
      updatedValues.saleDate = new Date();

    //create the pairs
    createPairs(req.param('products'))
      .then(function(pairs) {

        //get the sale to update
        Sale.findOne(req.param('id')).populate('products').exec(function(err,saleToUpdate){

          //get the customer
          User.findOne(saleToUpdate.customer, function(err, customer){

            //get his credit
            var totalPrice = 0;
            for (var i = 0; i < pairs.length; i++) {
              totalPrice += pairs[i].unitPrice * pairs[i].quantity;
            }

            //check if he has enough credit
            if (customer.credit + saleToUpdate.totalPrice < totalPrice) {

              //destroy the new pairs if he hasn't
              for (var i = 0; i < pairs.length; i++) {
                Pair.destroy(pairs[i]);
              }
              return res.send(406, "You don't have enough credit.");
            }
            else {

              //add the new pairs
              updatedValues.products = pairs;

              //update the sale with the new values
              Sale.update(saleToUpdate.id, updatedValues, function (err, updatedSale) {

                //get the updated sale
                updatedSale = updatedSale[0];

                //update the user's credit
                customer.credit = customer.credit + saleToUpdate.totalPrice - updatedSale.totalPrice;
                customer.save();

                return res.send(200, updatedSale);
              });
            }
          });
        });
      })
      .catch(res.negotiate);
  }

};

/**
* Creates Pairs
* @param pairs {Array} Array of productId-quantity pairs defined as follows [{productId: <Number>, quantity: <Number>}, ...]
*/
function createPairs(pairs) {

  var deferred = q.defer();

  var createdPairs = [];

  async.each(pairs, function(pair, cb) {

    var productId = pair.productId || pair.product;
    var quantity = pair.quantity;

    Pair.create({
      product: productId,
      quantity: quantity
    }, function(err, newPair) {
      if(err) {
        cb(err);
      }
      else {
        createdPairs.push(newPair);
        cb();
      }
    })

  }, function(err) {
    if(err) {
      deferred.reject(err);
    }
    else {
      deferred.resolve(createdPairs);
    }
  });

  return deferred.promise;
}
